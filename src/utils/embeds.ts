import { EmbedBuilder } from 'discord.js';
import { COLORS, EMBED_LIMITS, APP } from '../config/constants.js';

/**
 * Create a base embed with consistent branding.
 */
export function baseEmbed(color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: APP.FOOTER })
    .setTimestamp();
}

/**
 * Informational embed (blurple).
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.INFO).setTitle(
    truncateField(title, EMBED_LIMITS.TITLE),
  );
  if (description) {
    embed.setDescription(
      truncateField(description, EMBED_LIMITS.DESCRIPTION),
    );
  }
  return embed;
}

/**
 * Success embed (green).
 */
export function successEmbed(
  title: string,
  description?: string,
): EmbedBuilder {
  const embed = baseEmbed(COLORS.SUCCESS).setTitle(
    truncateField(title, EMBED_LIMITS.TITLE),
  );
  if (description) {
    embed.setDescription(
      truncateField(description, EMBED_LIMITS.DESCRIPTION),
    );
  }
  return embed;
}

/**
 * Error embed (red).
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.ERROR).setTitle(
    truncateField(title, EMBED_LIMITS.TITLE),
  );
  if (description) {
    embed.setDescription(
      truncateField(description, EMBED_LIMITS.DESCRIPTION),
    );
  }
  return embed;
}

/**
 * Warning embed (yellow).
 */
export function warningEmbed(
  title: string,
  description?: string,
): EmbedBuilder {
  const embed = baseEmbed(COLORS.WARNING).setTitle(
    truncateField(title, EMBED_LIMITS.TITLE),
  );
  if (description) {
    embed.setDescription(
      truncateField(description, EMBED_LIMITS.DESCRIPTION),
    );
  }
  return embed;
}

/**
 * Standard embed shown when public commands are disabled.
 */
export function publicCommandsDisabledEmbed(): EmbedBuilder {
  return warningEmbed(
    '⚠️ Public Commands Disabled',
    'Public commands are temporarily disabled in this server. ' +
      'Please try again later or contact an administrator.',
  );
}

/**
 * Standard embed shown when a user lacks permission.
 */
export function unauthorizedEmbed(reason?: string): EmbedBuilder {
  return errorEmbed(
    '🔒 Unauthorized',
    reason || 'You do not have permission to use this command.',
  );
}

/**
 * Truncate text to fit within Discord embed limits.
 * Appends an ellipsis if truncation occurs.
 */
export function truncateField(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
