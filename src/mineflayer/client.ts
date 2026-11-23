import mineflayer, { type Bot } from 'mineflayer';
import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { extractPlainText, stripColorCodes } from '../utils/minecraft.js';
import { createMineflayerProxyConnect, maskProxyUrl } from './proxy.js';

const log = createLogger('mineflayer-client');

export type ConnectionPhase =
  | 'idle'
  | 'tcp_connecting'
  | 'handshaking'
  | 'login'
  | 'configuration'
  | 'play'
  | 'spawned'
  | 'disconnected';

export interface MineflayerStatus {
  connected: boolean;
  connecting: boolean;
  username: string | null;
  server: string;
  proxy: string | null;
  inSkyPvP: boolean;
  currentSubserver: string;
  uptime: number | null;
  lastError: string | null;
  phase: ConnectionPhase;
  lastDisconnectReason: string | null;
  lastDisconnectPhase: string | null;
  lastDisconnectCode: string | null;
  lastDisconnectAt: Date | null;
  reconnectAttempts: number;
  circuitBreakerTripped: boolean;
  autoReconnectPaused: boolean;
}

/**
 * Safely parse Minecraft disconnect packets, kick reasons, and chat components
 * into a human-readable clean text string without control/color codes
 */
export function parseDisconnectReason(raw: any): string {
  if (!raw) return 'Unknown disconnect reason';

  try {
    if (typeof raw === 'object' && raw.reason !== undefined) {
      return parseDisconnectReason(raw.reason);
    }

    const extracted = extractPlainText(raw);
    const cleaned = stripColorCodes(extracted).replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      return cleaned;
    }
  } catch (err: any) {
    log.debug({ err: err?.message }, 'Error parsing disconnect packet');
  }

  if (typeof raw === 'string') {
    return stripColorCodes(raw).trim() || 'Unknown disconnect reason';
  }

  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export class MineflayerManager extends EventEmitter {
  private bot: Bot | null = null;
  private connecting = false;
  private connected = false;
  private connectTime: number | null = null;
  private lastError: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private stableTimer: NodeJS.Timeout | null = null;
  private currentUsername: string | null = null;
  private currentPassword?: string;
  private currentProxyUrl: string | null = null;
  private autoReconnectEnabled = true;
  private loggedIn = false;

  // Diagnostics and circuit-breaker state
  private phase: ConnectionPhase = 'idle';
  private lastDisconnectReason: string | null = null;
  private lastDisconnectPhase: string | null = null;
  private lastDisconnectCode: string | null = null;
  private lastDisconnectAt: Date | null = null;
  private reconnectAttempts = 0;
  private circuitBreakerTripped = false;

  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly BASE_RECONNECT_DELAY_MS = 10000; // 10s
  private static readonly MAX_RECONNECT_DELAY_MS = 120000; // 2m
  private static readonly STABLE_THRESHOLD_MS = 30000; // 30s connected = healthy

  constructor() {
    super();
  }

  public getStatus(): MineflayerStatus {
    const loc = this.getCurrentLocation();
    return {
      connected: this.connected,
      connecting: this.connecting,
      username: this.currentUsername,
      server: `${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}`,
      proxy: this.currentProxyUrl ? maskProxyUrl(this.currentProxyUrl) : null,
      inSkyPvP: loc.inSkyPvP,
      currentSubserver: loc.server,
      uptime: this.connectTime ? Date.now() - this.connectTime : null,
      lastError: this.lastError,
      phase: this.phase,
      lastDisconnectReason: this.lastDisconnectReason,
      lastDisconnectPhase: this.lastDisconnectPhase,
      lastDisconnectCode: this.lastDisconnectCode,
      lastDisconnectAt: this.lastDisconnectAt,
      reconnectAttempts: this.reconnectAttempts,
      circuitBreakerTripped: this.circuitBreakerTripped,
      autoReconnectPaused: this.circuitBreakerTripped || !this.autoReconnectEnabled,
    };
  }

  public setProxy(proxyUrl: string | null): void {
    this.currentProxyUrl = proxyUrl;
  }

  public getCurrentLocation(): { server: string; inSkyPvP: boolean; scoreboard: string[] } {
    if (!this.bot) return { server: 'Offline', inSkyPvP: false, scoreboard: [] };

    const sbItems: string[] = [];
    try {
      if (this.bot.scoreboards) {
        for (const sb of Object.values(this.bot.scoreboards as Record<string, any>)) {
          const s = sb as any;
          if (s?.title) sbItems.push(s.title);
          if (s?.items) {
            for (const item of Object.values(s.items as Record<string, any>)) {
              const it = item as any;
              if (it?.displayName) sbItems.push(it.displayName.toString());
            }
          }
        }
      }
    } catch {}

    const text = sbItems.join(' ').toLowerCase();
    const inSkyPvP = text.includes('skypvp') || text.includes('sky pvp');
    const isHub = text.includes('hub') || text.includes('lobby');

    return {
      server: inSkyPvP ? 'SkyPvP' : isHub ? 'Lobby' : sbItems[0] || 'Unknown/Connecting',
      inSkyPvP,
      scoreboard: sbItems,
    };
  }

  public getBot(): Bot | null {
    return this.bot;
  }

  public isConnected(): boolean {
    return this.connected && this.bot !== null;
  }

  public isConnecting(): boolean {
    return this.connecting;
  }

  /**
   * Safe teardown of all listeners, socket resources, and bot instance
   */
  private cleanupBot(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }

    if (this.bot) {
      try {
        const client = (this.bot as any)?._client;
        if (client) {
          if (client.socket) {
            client.socket.removeAllListeners();
            client.socket.on('error', () => {});
          }
          client.removeAllListeners();
          // Attach safety error sink so post-cleanup timers (e.g. keepalive) cannot crash Node
          client.on('error', (err: any) => {
            log.debug({ err: err?.message }, 'Absorbed post-cleanup protocol client error');
          });
        }
      } catch (e: any) {
        log.debug({ err: e?.message }, 'Error removing protocol client listeners');
      }

      try {
        this.bot.removeAllListeners();
        this.bot.on('error', () => {});
      } catch (e: any) {
        log.debug({ err: e?.message }, 'Error removing bot listeners');
      }

      try {
        this.bot.quit('Teardown and cleanup');
      } catch {}

      this.bot = null;
    }

    this.connected = false;
    this.connecting = false;
    this.loggedIn = false;
  }

  /**
   * Reset circuit breaker and attempt connection (owner-controlled recovery)
   */
  public async manualReconnect(username: string, password?: string, proxyUrl?: string): Promise<boolean> {
    log.info({ username }, 'Manual reconnect requested: resetting circuit breaker and retry counters');
    this.circuitBreakerTripped = false;
    this.reconnectAttempts = 0;
    this.autoReconnectEnabled = true;

    this.disconnect();
    return this.connect(username, password, true, proxyUrl);
  }

  /**
   * Connect to Minecraft server with comprehensive lifecycle hooks
   */
  public async connect(
    username: string,
    password?: string,
    isExplicit = false,
    proxyUrl?: string
  ): Promise<boolean> {
    if (this.connecting || this.connected) {
      if (!isExplicit) {
        log.warn('Mineflayer bot is already connecting or connected. Ignoring duplicate request.');
        return false;
      }
      this.cleanupBot();
    }

    if (this.circuitBreakerTripped && !isExplicit) {
      log.warn(
        { attempts: this.reconnectAttempts, max: MineflayerManager.MAX_RECONNECT_ATTEMPTS },
        'Mineflayer auto-reconnect circuit breaker is TRIPPED. Manual recovery required via /owneraccount connect.'
      );
      return false;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (proxyUrl !== undefined) {
      this.currentProxyUrl = proxyUrl;
    }

    this.connecting = true;
    this.connected = false;
    this.phase = 'tcp_connecting';
    this.currentUsername = username;
    this.currentPassword = password;
    this.lastError = null;
    this.loggedIn = false;

    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      try {
        const botOptions: any = {
          host: env.MINEFLAYER_HOST,
          port: env.MINEFLAYER_PORT,
          username,
          auth: 'offline', // PikaNetwork offline-mode/cracked support
          version: '1.20.4',
          checkTimeoutInterval: 60 * 1000, // 60s grace period for keepalive (prevents premature 30s timeout on proxy/lag)
          hideErrors: false,
        };

        if (this.currentProxyUrl) {
          botOptions.connect = createMineflayerProxyConnect(
            this.currentProxyUrl,
            env.MINEFLAYER_HOST,
            env.MINEFLAYER_PORT
          );
          log.info(
            {
              username,
              host: env.MINEFLAYER_HOST,
              port: env.MINEFLAYER_PORT,
              proxy: maskProxyUrl(this.currentProxyUrl),
              attempt: this.reconnectAttempts + 1,
              maxAttempts: MineflayerManager.MAX_RECONNECT_ATTEMPTS,
            },
            'Initializing Mineflayer bot connection via proxy'
          );
        } else {
          log.info(
            {
              username,
              host: env.MINEFLAYER_HOST,
              port: env.MINEFLAYER_PORT,
              attempt: this.reconnectAttempts + 1,
              maxAttempts: MineflayerManager.MAX_RECONNECT_ATTEMPTS,
            },
            'Initializing Mineflayer bot connection (direct TCP)'
          );
        }

        this.bot = mineflayer.createBot(botOptions);

        // ==========================================
        // 1. Low-level Protocol Client Listeners
        // ==========================================
        const client = (this.bot as any)?._client;
        if (client) {
          client.on('connect_allowed', () => {
            this.phase = 'tcp_connecting';
            log.debug('Protocol client TCP connect permitted');
          });

          client.on('connect', () => {
            if (this.phase === 'tcp_connecting' || this.phase === 'idle') {
              this.phase = 'handshaking';
            }
            log.info(
              { host: env.MINEFLAYER_HOST, port: env.MINEFLAYER_PORT },
              'TCP socket connection established with Minecraft server'
            );
          });

          // Safeguard against Mineflayer inventory transaction packet edge cases and unhandled error crashes
          const originalEmit = client.emit.bind(client);
          client.emit = function (event: string, ...args: any[]) {
            if (event === 'transaction') {
              try {
                return originalEmit(event, ...args);
              } catch (err: any) {
                log.debug({ err: err?.message }, 'Handled Mineflayer confirmTransaction packet edge case safely');
                return false;
              }
            }
            if (event === 'error') {
              try {
                // If there are no active error listeners on client, absorb the error so Node doesn't crash with unhandled 'error'
                if (client.listenerCount('error') === 0) {
                  log.warn({ err: args[0]?.message }, 'Absorbed protocol client error without active listeners safely');
                  return false;
                }
                return originalEmit(event, ...args);
              } catch (err: any) {
                log.warn({ err: err?.message }, 'Safely caught error inside protocol client emit');
                return false;
              }
            }
            return originalEmit(event, ...args);
          };

          client.on('state', (newState: string, oldState: string) => {
            this.phase = newState as ConnectionPhase;
            log.info(
              { fromPhase: oldState, toPhase: newState },
              'Minecraft protocol state transitioned'
            );
          });

          client.on('session', () => {
            log.debug('Minecraft client protocol session initialized');
          });

          client.on('disconnect', (packet: any) => {
            const reason = parseDisconnectReason(packet);
            this.lastDisconnectReason = reason;
            this.lastDisconnectPhase = this.phase;
            log.warn(
              { phase: this.phase, reason },
              'Minecraft protocol disconnect packet received during handshake/login'
            );
          });

          client.on('kick_disconnect', (packet: any) => {
            const reason = parseDisconnectReason(packet);
            this.lastDisconnectReason = reason;
            this.lastDisconnectPhase = this.phase;
            log.warn(
              { phase: this.phase, reason },
              'Minecraft protocol kick_disconnect packet received'
            );
          });

          client.on('error', (err: any) => {
            const code = (err as any)?.code || 'PROTOCOL_ERROR';
            this.lastDisconnectCode = code;
            log.error(
              { err: err?.message, code, phase: this.phase },
              'Minecraft low-level protocol client error'
            );
          });

          if (client.socket) {
            client.socket.on('error', (err: any) => {
              const code = (err as any)?.code || 'SOCKET_ERROR';
              this.lastDisconnectCode = code;
              log.error(
                { err: err?.message, code, phase: this.phase },
                'Minecraft TCP socket connection error'
              );
            });

            client.socket.on('close', (hadError: boolean) => {
              log.debug({ hadError, phase: this.phase }, 'Minecraft TCP socket closed');
            });
          }

          client.on('end', (reason: any) => {
            const endCode = reason || (client as any)?._endReason || 'socketClosed';
            this.lastDisconnectCode = String(endCode);
            log.debug({ endCode, phase: this.phase }, 'Minecraft protocol client ended');
          });
        }

        // ==========================================
        // 2. High-Level Mineflayer Bot Listeners
        // ==========================================
        this.bot.on('login', () => {
          this.phase = 'play';
          log.info('Mineflayer bot successfully negotiated Minecraft login');
        });

        this.bot.on('spawn', () => {
          this.connected = true;
          this.connecting = false;
          this.phase = 'spawned';
          if (!this.connectTime) this.connectTime = Date.now();

          log.info('Mineflayer bot spawned into game world');

          // Reset reconnect attempts after staying connected stably for 30s
          if (this.stableTimer) clearTimeout(this.stableTimer);
          this.stableTimer = setTimeout(() => {
            if (this.connected) {
              this.reconnectAttempts = 0;
              log.info('Mineflayer connection healthy; consecutive failure counter reset to 0');
            }
          }, MineflayerManager.STABLE_THRESHOLD_MS);

          // Check inventory items
          try {
            const items = (this.bot as any)?.inventory.items().map((i: any) => ({
              slot: i.slot,
              name: i.name,
              displayName: i.displayName,
            }));
            log.info({ items }, 'Player hotbar items on spawn');
          } catch {}

          // If password provided for in-game /login, attempt initial login
          if (password && !this.loggedIn) {
            setTimeout(() => {
              if (this.connected && !this.loggedIn) {
                log.info('Sending initial /login');
                this.sendCommand(`/login ${password}`);
              }
            }, 1500);
          }

          // Navigate to SkyPvP server after short delay
          setTimeout(() => {
            if (this.connected) {
              const loc = this.getCurrentLocation();
              if (!loc.inSkyPvP) {
                log.info('Attempting navigation to SkyPvP (/server skypvp)');
                this.sendCommand('/server skypvp');
              }
            }
          }, 4500);

          this.emit('ready');
          safeResolve(true);
        });

        this.bot.on('scoreboardTitleChanged', (sb: any) => {
          log.info({ title: sb?.title }, 'Scoreboard title updated');
        });

        this.bot.on('message', (jsonMsg: any, position: any) => {
          if (position === 'game_info') {
            return; // Skip action bar messages
          }

          const raw = jsonMsg.toString();
          // Filter HUD progress spam if it bypasses game_info position
          if (raw.includes('➟') || /\[\d+[\d,]*\/\d+[\d,]*\]/.test(raw)) {
            return;
          }

          log.info({ chat: raw }, 'Minecraft in-game message');

          const lower = raw.toLowerCase();
          if (password) {
            if (lower.includes('/register') || lower.includes('register with')) {
              log.info('Server requested registration, sending /register');
              this.sendCommand(`/register ${password} ${password}`);
            } else if (lower.includes('/login') || lower.includes('login with') || lower.includes('please login')) {
              log.info('Server requested login, sending /login');
              this.sendCommand(`/login ${password}`);
            } else if (
              lower.includes('successfully logged in') ||
              lower.includes('successful login') ||
              lower.includes('welcome')
            ) {
              this.loggedIn = true;
              log.info('Successfully authenticated, navigating to SkyPvP (/server skypvp)');
              setTimeout(() => this.sendCommand('/server skypvp'), 2000);
            }
          }

          // Handle server change notifications
          if (lower.includes('connecting to skypvp') || lower.includes('sending you to skypvp')) {
            log.info('Minecraft server confirmed connecting to SkyPvP');
          }

          this.emit('chatMessage', raw, jsonMsg);
        });

        this.bot.on('windowOpen', (window: any) => {
          log.info({ title: window?.title, slots: window?.slots?.length }, 'GUI Window opened in Minecraft');
          this.emit('windowOpen', window);
        });

        this.bot.on('kicked', (reason: any, loggedIn: boolean) => {
          const parsedReason = parseDisconnectReason(reason);
          this.lastDisconnectReason = parsedReason;
          this.lastDisconnectPhase = this.phase;
          this.lastDisconnectAt = new Date();

          log.warn(
            { phase: this.phase, loggedIn, reason: parsedReason },
            'Mineflayer bot kicked from server'
          );

          this.handleDisconnect(`Kicked: ${parsedReason}`);
          safeResolve(false);
        });

        this.bot.on('end', (reason: any) => {
          const endCode = reason || (this.bot as any)?._client?._endReason || 'socketClosed';
          this.lastDisconnectCode = String(endCode);
          this.lastDisconnectAt = new Date();

          // Retain structured kick reason if kick packet arrived first
          const disconnectDescription = this.lastDisconnectReason
            ? this.lastDisconnectReason
            : `Connection closed (${endCode})`;

          log.warn(
            { phase: this.phase, endCode, reason: disconnectDescription },
            'Mineflayer bot connection ended'
          );

          this.handleDisconnect(disconnectDescription);
          safeResolve(false);
        });

        this.bot.on('error', (err: any) => {
          const errorMsg = err?.message || 'Unknown Mineflayer error';
          this.lastError = errorMsg;
          this.lastDisconnectCode = (err as any)?.code || 'BOT_ERROR';
          this.lastDisconnectAt = new Date();

          log.error(
            { err: errorMsg, code: (err as any)?.code, phase: this.phase },
            'Mineflayer bot runtime error'
          );

          this.handleDisconnect(errorMsg);
          safeResolve(false);
        });
      } catch (err: any) {
        const errorMsg = err?.message ?? 'Failed to instantiate Mineflayer client';
        log.error({ err: errorMsg }, 'Exception creating Mineflayer instance');
        this.lastError = errorMsg;
        this.connecting = false;
        this.phase = 'disconnected';
        safeResolve(false);
      }
    });
  }

  public sendCommand(cmd: string): void {
    if (!this.bot || !this.connected) {
      log.warn({ cmd }, 'Cannot send command, bot is not connected');
      return;
    }
    const cleanCmd = cmd.startsWith('/') || cmd.startsWith('./') ? cmd : `/${cmd}`;
    log.info({ cmd: cleanCmd }, 'Sending command to Minecraft server');
    this.bot.chat(cleanCmd);
  }

  public disconnect(): void {
    this.autoReconnectEnabled = false;
    this.circuitBreakerTripped = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    log.info('Explicitly disconnecting Mineflayer bot and cleaning up resources');
    this.cleanupBot();

    this.phase = 'disconnected';
    this.connectTime = null;
  }

  private handleDisconnect(reason: string): void {
    const previousPhase = this.phase;
    this.phase = 'disconnected';
    this.connected = false;
    this.connecting = false;
    this.connectTime = null;
    this.lastError = reason;
    this.loggedIn = false;

    this.cleanupBot();
    this.emit('disconnected', reason);

    // Auto-reconnect handling with exponential backoff and circuit breaker
    if (this.autoReconnectEnabled && this.currentUsername) {
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= MineflayerManager.MAX_RECONNECT_ATTEMPTS) {
        this.circuitBreakerTripped = true;
        log.warn(
          {
            attempts: this.reconnectAttempts,
            max: MineflayerManager.MAX_RECONNECT_ATTEMPTS,
            lastPhase: previousPhase,
            reason,
          },
          'Circuit breaker TRIPPED: stopped aggressive reconnect loop after 5 consecutive failures. Use /owneraccount connect or /owneraccount reconnect to resume.'
        );
        this.emit('circuitBreakerTripped', {
          attempts: this.reconnectAttempts,
          reason,
          phase: previousPhase,
        });
        return;
      }

      // Exponential backoff with jitter: base * 1.5^(attempt - 1) + jitter
      const backoffFactor = Math.pow(1.5, this.reconnectAttempts - 1);
      const computedDelay = Math.min(
        MineflayerManager.BASE_RECONNECT_DELAY_MS * backoffFactor,
        MineflayerManager.MAX_RECONNECT_DELAY_MS
      );
      const jitter = Math.floor(Math.random() * 2500);
      const finalDelayMs = Math.round(computedDelay + jitter);

      log.info(
        {
          attempt: this.reconnectAttempts,
          maxAttempts: MineflayerManager.MAX_RECONNECT_ATTEMPTS,
          delaySeconds: Math.round(finalDelayMs / 1000),
          lastPhase: previousPhase,
          reason,
        },
        'Scheduling Mineflayer auto-reconnect with exponential backoff'
      );

      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        log.info(
          { attempt: this.reconnectAttempts, username: this.currentUsername },
          'Executing scheduled Mineflayer auto-reconnect...'
        );
        if (this.currentUsername && !this.circuitBreakerTripped && this.autoReconnectEnabled) {
          this.connect(this.currentUsername, this.currentPassword, false, this.currentProxyUrl || undefined);
        }
      }, finalDelayMs);
    }
  }
}

export const mineflayerManager = new MineflayerManager();
