import { redis } from '../utils/redis.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('system-service');

export const PUBLIC_COMMAND_NAMES = [
  'auction',
  'bal',
  'baltop',
  'baltops',
  'chat',
  'chatstatus',
  'compare',
  'events',
  'fights',
  'help',
  'killfeed',
  'leaderboard',
  'ping',
  'player',
  'profile',
  'stats',
  'team',
  'track',
] as const;

export type PublicCommandName = (typeof PUBLIC_COMMAND_NAMES)[number];

export class SystemService {
  private maintenanceMode = false;
  private blacklistedUsers = new Set<string>();
  private disabledCommandsGlobal = new Set<string>();
  private disabledCommandsGuild = new Map<string, Set<string>>();
  private dynamicOwners = new Set<string>();

  constructor() {
    this.init();
  }

  private async init() {
    try {
      // Check Redis for persisted maintenance flag
      const maint = await redis.get('system:maintenance');
      if (maint === 'true') {
        this.maintenanceMode = true;
      }

      // Check Redis for blacklisted users
      const blacklist = await redis.smembers('system:blacklist');
      for (const u of blacklist) {
        this.blacklistedUsers.add(u);
      }

      // Check Redis for dynamically added co-owners
      const coOwners = await redis.smembers('system:owners');
      for (const o of coOwners) {
        this.dynamicOwners.add(o);
      }

      // Check Redis for globally disabled public commands
      const disabledCmds = await redis.smembers('system:disabled_public_commands');
      for (const cmd of disabledCmds) {
        this.disabledCommandsGlobal.add(cmd.toLowerCase());
      }

      // Load DB public command settings for backup persistence
      const allSettings = await prisma.publicCommandSettings.findMany();
      for (const setting of allSettings) {
        try {
          const list: string[] = JSON.parse(setting.disabledCommands || '[]');
          if (setting.guildId === 'global') {
            for (const c of list) this.disabledCommandsGlobal.add(c.toLowerCase());
          } else {
            let guildSet = this.disabledCommandsGuild.get(setting.guildId);
            if (!guildSet) {
              guildSet = new Set<string>();
              this.disabledCommandsGuild.set(setting.guildId, guildSet);
            }
            for (const c of list) guildSet.add(c.toLowerCase());
          }
        } catch (_) {}
      }
    } catch (err: any) {
      log.debug({ err: err?.message }, 'Failed to initialize system state from Redis/DB');
    }
  }

  public isMaintenance(): boolean {
    return this.maintenanceMode;
  }

  public async setMaintenance(enabled: boolean): Promise<void> {
    this.maintenanceMode = enabled;
    try {
      if (enabled) {
        await redis.set('system:maintenance', 'true');
      } else {
        await redis.del('system:maintenance');
      }
    } catch (_) {}
    log.info({ enabled }, 'Maintenance mode updated');
  }

  public isBlacklisted(userId: string): boolean {
    return this.blacklistedUsers.has(userId);
  }

  public async addBlacklist(userId: string): Promise<void> {
    this.blacklistedUsers.add(userId);
    try {
      await redis.sadd('system:blacklist', userId);
    } catch (_) {}
    log.info({ userId }, 'User added to blacklist');
  }

  public async removeBlacklist(userId: string): Promise<void> {
    this.blacklistedUsers.delete(userId);
    try {
      await redis.srem('system:blacklist', userId);
    } catch (_) {}
    log.info({ userId }, 'User removed from blacklist');
  }

  public getBlacklisted(): string[] {
    return Array.from(this.blacklistedUsers);
  }

  public isOwner(userId: string): boolean {
    if (!userId) return false;
    const configured = this.getConfiguredOwners();
    if (configured.includes(userId)) return true;
    return this.dynamicOwners.has(userId);
  }

  public getConfiguredOwners(): string[] {
    const raw = `${env.DISCORD_OWNER_ID || ''} ${process.env.DISCORD_OWNER_IDS || ''}`;
    return raw
      .split(/[,;\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  public getDynamicOwners(): string[] {
    return Array.from(this.dynamicOwners);
  }

  public getAllOwners(): string[] {
    const set = new Set([...this.getConfiguredOwners(), ...this.dynamicOwners]);
    return Array.from(set);
  }

  public async addOwner(userId: string): Promise<boolean> {
    if (!userId) return false;
    this.dynamicOwners.add(userId);
    try {
      await redis.sadd('system:owners', userId);
    } catch (_) {}
    log.info({ userId }, 'Added bot co-owner');
    return true;
  }

  public async removeOwner(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (this.getConfiguredOwners().includes(userId)) {
      return false; // Cannot remove primary configured env owner
    }
    this.dynamicOwners.delete(userId);
    try {
      await redis.srem('system:owners', userId);
    } catch (_) {}
    log.info({ userId }, 'Removed bot co-owner');
    return true;
  }

  public isCommandDisabled(commandName: string, guildId?: string): boolean {
    const cmd = commandName.toLowerCase();
    if (this.disabledCommandsGlobal.has(cmd)) {
      return true;
    }
    if (guildId) {
      const guildSet = this.disabledCommandsGuild.get(guildId);
      if (guildSet && guildSet.has(cmd)) {
        return true;
      }
    }
    return false;
  }

  public async setCommandAvailability(
    commandName: string,
    available: boolean,
    guildId = 'global'
  ): Promise<void> {
    const cmd = commandName.toLowerCase();
    if (guildId !== 'global') {
      let guildSet = this.disabledCommandsGuild.get(guildId);
      if (!guildSet) {
        guildSet = new Set<string>();
        this.disabledCommandsGuild.set(guildId, guildSet);
      }
      if (available) {
        guildSet.delete(cmd);
        try {
          await redis.srem(`system:disabled_public_commands:${guildId}`, cmd);
        } catch (_) {}
      } else {
        guildSet.add(cmd);
        try {
          await redis.sadd(`system:disabled_public_commands:${guildId}`, cmd);
        } catch (_) {}
      }
      try {
        await prisma.publicCommandSettings.upsert({
          where: { guildId },
          update: { disabledCommands: JSON.stringify(Array.from(guildSet)) },
          create: { guildId, disabledCommands: JSON.stringify(Array.from(guildSet)) },
        });
      } catch (_) {}
    } else {
      if (available) {
        this.disabledCommandsGlobal.delete(cmd);
        try {
          await redis.srem('system:disabled_public_commands', cmd);
        } catch (_) {}
      } else {
        this.disabledCommandsGlobal.add(cmd);
        try {
          await redis.sadd('system:disabled_public_commands', cmd);
        } catch (_) {}
      }
      try {
        await prisma.publicCommandSettings.upsert({
          where: { guildId: 'global' },
          update: { disabledCommands: JSON.stringify(Array.from(this.disabledCommandsGlobal)) },
          create: { guildId: 'global', disabledCommands: JSON.stringify(Array.from(this.disabledCommandsGlobal)) },
        });
      } catch (_) {}
    }
    log.info({ command: cmd, available, guildId }, 'Updated public command availability');
  }

  public async setAllCommandsAvailability(available: boolean, guildId = 'global'): Promise<void> {
    for (const cmd of PUBLIC_COMMAND_NAMES) {
      await this.setCommandAvailability(cmd, available, guildId);
    }
  }

  public getCommandAvailability(guildId = 'global'): { command: string; available: boolean }[] {
    return PUBLIC_COMMAND_NAMES.map((cmd) => ({
      command: cmd,
      available: !this.isCommandDisabled(cmd, guildId === 'global' ? undefined : guildId),
    }));
  }
}

export const systemService = new SystemService();
