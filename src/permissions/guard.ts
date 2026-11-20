import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { PermissionLevel } from './levels.js';
import { prisma } from '../db/prisma.js';
import { createLogger } from '../utils/logger.js';
import { systemService } from '../services/system.js';

const log = createLogger('permissions');

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if the invoking user has the required permission level.
 */
export async function checkPermission(
  interaction: ChatInputCommandInteraction,
  level: PermissionLevel,
): Promise<PermissionCheckResult> {
  const userId = interaction.user.id;

  // 1. Blacklist check (Owner cannot be blacklisted)
  if (!isOwner(userId) && systemService.isBlacklisted(userId)) {
    return {
      allowed: false,
      reason: 'You have been blacklisted from using this bot.',
    };
  }

  // 2. Global maintenance mode check (Owner can always bypass)
  if (!isOwner(userId) && systemService.isMaintenance()) {
    return {
      allowed: false,
      reason: 'The bot is currently in maintenance mode. Please try again later.',
    };
  }

  switch (level) {
    case PermissionLevel.OWNER: {
      if (!isOwner(userId)) {
        log.warn(
          { userId, command: interaction.commandName },
          'Unauthorized owner command attempt',
        );
        return {
          allowed: false,
          reason: 'This command is restricted to the bot owner.',
        };
      }
      return { allowed: true };
    }

    case PermissionLevel.ADMIN: {
      if (isOwner(userId)) {
        return { allowed: true };
      }
      const member = interaction.member as GuildMember | null;
      if (!member || !isAdmin(member)) {
        return {
          allowed: false,
          reason:
            'This command requires the Administrator permission in this server.',
        };
      }
      return { allowed: true };
    }

    case PermissionLevel.PUBLIC: {
      // Owner and admins always have access
      if (isOwner(userId)) {
        return { allowed: true };
      }
      const memberForPublic = interaction.member as GuildMember | null;
      if (memberForPublic && isAdmin(memberForPublic)) {
        return { allowed: true };
      }

      const guildId = interaction.guildId;
      const commandName = interaction.commandName;

      // 1. Check if this specific command is disabled
      if (systemService.isCommandDisabled(commandName, guildId ?? undefined)) {
        return {
          allowed: false,
          reason: `The command \`/${commandName}\` is currently disabled for public use by the bot owner.`,
        };
      }

      // 2. Check if all public commands are disabled for this guild
      if (guildId) {
        const enabled = await arePublicCommandsEnabled(guildId);
        if (!enabled) {
          return {
            allowed: false,
            reason: 'Public commands are currently disabled in this server.',
          };
        }
      }

      return { allowed: true };
    }

    default:
      return { allowed: false, reason: 'Unknown permission level.' };
  }
}

/**
 * Check if a user ID matches any configured or dynamic bot owner.
 */
export function isOwner(userId: string): boolean {
  return systemService.isOwner(userId);
}

/**
 * Get all current bot owner IDs.
 */
export function getOwnerIds(): string[] {
  return systemService.getAllOwners();
}

/**
 * Check if a guild member has the Administrator permission.
 */
export function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if public commands are enabled for a guild.
 * Defaults to true if no setting exists.
 */
export async function arePublicCommandsEnabled(
  guildId: string,
): Promise<boolean> {
  try {
    const settings = await prisma.publicCommandSettings.findUnique({
      where: { guildId },
    });
    // Default to enabled if no record exists
    return settings?.enabled ?? true;
  } catch (error) {
    log.error({ error, guildId }, 'Failed to check public command settings');
    // Fail open to avoid breaking the bot if DB is down
    return true;
  }
}
