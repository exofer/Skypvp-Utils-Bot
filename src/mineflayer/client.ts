import mineflayer, { type Bot } from 'mineflayer';
import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';
import { env } from '../config/env.js';

const log = createLogger('mineflayer-client');

export interface MineflayerStatus {
  connected: boolean;
  connecting: boolean;
  username: string | null;
  server: string;
  inSkyPvP: boolean;
  currentSubserver: string;
  uptime: number | null;
  lastError: string | null;
}

export class MineflayerManager extends EventEmitter {
  private bot: Bot | null = null;
  private connecting = false;
  private connected = false;
  private connectTime: number | null = null;
  private lastError: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentUsername: string | null = null;
  private currentPassword?: string;
  private autoReconnectEnabled = true;
  private loggedIn = false;

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
      inSkyPvP: loc.inSkyPvP,
      currentSubserver: loc.server,
      uptime: this.connectTime ? Date.now() - this.connectTime : null,
      lastError: this.lastError,
    };
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

  public async connect(username: string, password?: string): Promise<boolean> {
    if (this.connecting || this.connected) {
      log.warn('Mineflayer bot is already connecting or connected');
      return false;
    }

    this.connecting = true;
    this.currentUsername = username;
    this.currentPassword = password;
    this.lastError = null;
    this.loggedIn = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    return new Promise((resolve) => {
      try {
        log.info({ username, host: env.MINEFLAYER_HOST }, 'Initializing Mineflayer bot connection');

        this.bot = mineflayer.createBot({
          host: env.MINEFLAYER_HOST,
          port: env.MINEFLAYER_PORT,
          username,
          auth: 'offline', // PikaNetwork offline-mode/cracked support
          version: '1.20.4',
          hideErrors: false,
        });

        this.bot.on('spawn', () => {
          log.info('Mineflayer bot spawned in game');
          this.connected = true;
          this.connecting = false;
          if (!this.connectTime) this.connectTime = Date.now();

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
          resolve(true);
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
            } else if (lower.includes('successfully logged in') || lower.includes('successful login') || lower.includes('welcome')) {
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

        this.bot.on('kicked', (reason: any) => {
          const kickStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
          log.warn({ reason: kickStr }, 'Mineflayer bot was kicked from server');
          this.handleDisconnect(`Kicked: ${kickStr}`);
          resolve(false);
        });

        this.bot.on('end', () => {
          log.warn('Mineflayer bot connection ended');
          this.handleDisconnect('Connection ended');
          resolve(false);
        });

        this.bot.on('error', (err: any) => {
          log.error({ err: err?.message }, 'Mineflayer bot error');
          this.lastError = err?.message;
          this.handleDisconnect(err?.message);
          resolve(false);
        });
      } catch (err: any) {
        log.error({ err: err?.message }, 'Failed to create Mineflayer instance');
        this.lastError = err?.message ?? 'Unknown connection error';
        this.connecting = false;
        resolve(false);
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.bot) {
      log.info('Disconnecting Mineflayer bot');
      this.bot.quit();
      this.bot = null;
    }
    this.connected = false;
    this.connecting = false;
    this.connectTime = null;
    this.loggedIn = false;
  }

  private handleDisconnect(reason: string): void {
    this.connected = false;
    this.connecting = false;
    this.connectTime = null;
    this.lastError = reason;
    this.loggedIn = false;
    this.emit('disconnected', reason);

    // Auto-reconnect if enabled
    if (this.autoReconnectEnabled && this.currentUsername) {
      log.info('Scheduling Mineflayer auto-reconnect in 8 seconds...');
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        log.info('Executing scheduled auto-reconnect...');
        if (this.currentUsername) {
          this.connect(this.currentUsername, this.currentPassword);
        }
      }, 8000);
    }
  }
}

export const mineflayerManager = new MineflayerManager();
