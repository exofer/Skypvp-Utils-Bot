import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { eventProvider, type SkyPvPEventType, type SkyPvPEventState } from '../providers/event.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event-service');

export class EventService {
  private lastAlertedStatus = new Map<SkyPvPEventType, boolean>();

  public async checkAndNotifyEvents(): Promise<void> {
    const states = eventProvider.getEventStates();

    for (const state of states) {
      const previouslyActive = this.lastAlertedStatus.get(state.type) ?? false;

      // Detect transition to ACTIVE
      if (state.active && !previouslyActive) {
        log.info({ event: state.name }, 'New SkyPvP event start detected! Broadcasting notification.');
        await this.broadcastEventStart(state);
        this.lastAlertedStatus.set(state.type, true);

        // Record in database
        try {
          await prisma.eventRecord.create({
            data: {
              eventType: state.type as any,
              status: 'ACTIVE',
              startedAt: state.startedAt ?? new Date(),
              notified: true,
            },
          });
        } catch (e: any) {
          log.warn({ err: e.message }, 'Failed to record EventRecord in DB');
        }
      } else if (!state.active && previouslyActive) {
        this.lastAlertedStatus.set(state.type, false);
      }
    }
  }

  private async broadcastEventStart(state: SkyPvPEventState): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        eventNotificationsEnabled: true,
        eventChannelId: { not: null },
      },
    });

    for (const config of configs) {
      if (!config.eventChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.eventChannelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

        // Determine specific role for this event
        const roleId = this.getRoleIdForEvent(config, state.type);
        const roleMention = roleId ? `<@&${roleId}>` : '';

        const embed = infoEmbed(
          `⚔️ SkyPvP Event: ${state.name}`,
          `**${state.name}** is now active in SkyPvP!`
        );
        embed.setColor(COLORS.EVENT);

        embed.addFields([
          { name: 'Event Name', value: state.name, inline: true },
          { name: 'Status', value: '🟢 Active Now', inline: true },
          { name: 'Started At', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
        ]);

        if (state.details) {
          embed.addFields({ name: 'Details', value: state.details, inline: false });
        }

        await (channel as any).send({
          content: roleMention ? roleMention : undefined,
          embeds: [embed],
        });
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to deliver event notification');
      }
    }
  }

  private getRoleIdForEvent(config: any, type: SkyPvPEventType): string | null {
    switch (type) {
      case 'FLORAL_FORTUNE':
        return config.floralFortuneRoleId;
      case 'ENVOY_DROPS':
        return config.envoyDropsRoleId;
      case 'BLOOD_LUST':
        return config.bloodLustRoleId;
      case 'GOLD_RUSH':
        return config.goldRushRoleId;
      case 'HARD_POINT':
        return config.hardPointRoleId;
      case 'KOTL':
        return config.kotlRoleId;
      default:
        return null;
    }
  }
}

export const eventService = new EventService();
