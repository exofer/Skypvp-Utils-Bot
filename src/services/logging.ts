import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('discord-logger');

export type LogCategoryType =
  | 'COMMAND'
  | 'ADMIN'
  | 'OWNER'
  | 'AUCTION'
  | 'EVENT'
  | 'KOTH'
  | 'STRONGHOLD'
  | 'OUTPOST'
  | 'CHAT_BRIDGE'
  | 'MINEFLAYER'
  | 'SYSTEM'
  | 'API'
  | 'UPDATE_PUBLICATION';

export class DiscordLoggingService {
  /**
   * Log an event to the configured Discord channel for its category
   */
  public async logEvent(
    guildId: string,
    category: LogCategoryType,
    title: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      const config = await prisma.logConfiguration.findUnique({
        where: {
          guildId_category: {
            guildId,
            category: category as any,
          },
        },
      });

      if (!config || !config.enabled || !config.channelId) {
        return;
      }

      const channel = await client.channels.fetch(config.channelId);
      if (!channel || !channel.isTextBased() || !('send' in channel)) return;

      const embed = infoEmbed(`📝 [${category}] ${title}`);
      embed.setColor(COLORS.INFO);

      for (const [key, val] of Object.entries(details)) {
        if (val !== undefined && val !== null) {
          const stringVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
          embed.addFields({
            name: key,
            value: stringVal.length > 1024 ? stringVal.substring(0, 1020) + '...' : stringVal,
            inline: false,
          });
        }
      }

      await (channel as any).send({ embeds: [embed] });
    } catch (err: any) {
      log.warn({ category, err: err?.message }, 'Failed to deliver Discord log record');
    }
  }
}

export const discordLogger = new DiscordLoggingService();
