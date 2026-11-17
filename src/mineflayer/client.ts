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

  constructor() {
    super();
  }

  public getStatus(): MineflayerStatus {
    return {
      connected: this.connected,
      connecting: this.connecting,
      username: this.currentUsername,
      server: `${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}`,
      uptime: this.connectTime ? Date.now() - this.connectTime : null,
      lastError: this.lastError,
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
    this.lastError = null;

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

        this.bot.once('spawn', () => {
          log.info('Mineflayer bot spawned in game');
          this.connected = true;
          this.connecting = false;
          this.connectTime = Date.now();

          // If password provided for in-game /login
          if (password) {
            setTimeout(() => {
              this.sendCommand(`/login ${password}`);
            }, 2000);
          }

          // Navigate to SkyPvP server
          setTimeout(() => {
            this.sendCommand('/server skypvp');
          }, 5000);

          this.emit('ready');
          resolve(true);
        });

        this.bot.on('message', (jsonMsg) => {
          const raw = jsonMsg.toString();
          this.emit('chatMessage', raw, jsonMsg);
        });

        this.bot.on('windowOpen', (window) => {
          log.debug({ title: window.title }, 'GUI Window opened in Minecraft');
          this.emit('windowOpen', window);
        });

        this.bot.on('kicked', (reason) => {
          log.warn({ reason }, 'Mineflayer bot was kicked from server');
          this.handleDisconnect(`Kicked: ${reason}`);
          resolve(false);
        });

        this.bot.on('end', () => {
          log.warn('Mineflayer bot connection ended');
          this.handleDisconnect('Connection ended');
          resolve(false);
        });

        this.bot.on('error', (err) => {
          log.error({ err: err.message }, 'Mineflayer bot error');
          this.lastError = err.message;
          this.handleDisconnect(err.message);
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
    const cleanCmd = cmd.startsWith('/') ? cmd : `/${cmd}`;
    log.debug({ cmd: cleanCmd }, 'Sending command to Minecraft server');
    this.bot.chat(cleanCmd);
  }

  public disconnect(): void {
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
  }

  private handleDisconnect(reason: string): void {
    this.connected = false;
    this.connecting = false;
    this.connectTime = null;
    this.lastError = reason;
    this.emit('disconnected', reason);
  }
}

export const mineflayerManager = new MineflayerManager();
