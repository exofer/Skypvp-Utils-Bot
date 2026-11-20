import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { eventProvider, type SkyPvPEventType, type SkyPvPEventState } from '../providers/event.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event-service');

export class EventService {
  private lastAlertedStatus = new Map<SkyPvPEventType, boolean>();
  private lastAlertedTimestamp = new Map<SkyPvPEventType, number>();
  private isAlerting = new Map<SkyPvPEventType, boolean>();
  private alertedUpcomingCycles = new Set<string>();
  private isUpcomingAlerting = new Map<string, boolean>();

  constructor() {
    eventProvider.on('eventUpcoming', async (state: SkyPvPEventState) => {
      try {
        await this.handleEventUpcoming(state);
      } catch (err: any) {
        log.error({ err: err?.message, event: state.name }, 'Error handling upcoming event');
      }
    });

    eventProvider.on('eventStarted', async (state: SkyPvPEventState) => {
      try {
        await this.handleEventStarted(state);
      } catch (err: any) {
        log.error({ err: err?.message, event: state.name }, 'Error handling started event');
      }
    });

    eventProvider.on('eventEnded', (state: SkyPvPEventState) => {
      this.lastAlertedStatus.set(state.type, false);
      this.clearUpcomingCycle(state.type);
    });
  }

  public clearUpcomingCycle(type: SkyPvPEventType): void {
    for (const key of Array.from(this.alertedUpcomingCycles)) {
      if (key.startsWith(`${type}:`)) {
        this.alertedUpcomingCycles.delete(key);
      }
    }
  }

  public async checkAndNotifyEvents(): Promise<void> {
    const states = eventProvider.getEventStates();

    for (const state of states) {
      const minutes = state.startsInMinutes ?? 5;
      const alertKey = `${state.type}:${minutes}`;

      // Check upcoming alerts — ONLY if not already alerted for this cycle
      if (state.upcoming && !state.upcomingAlertSent && !state.active && !this.alertedUpcomingCycles.has(alertKey)) {
        await this.handleEventUpcoming(state);
      }

      // Check active alerts
      const previouslyActive = this.lastAlertedStatus.get(state.type) ?? false;
      const lastAlertTime = this.lastAlertedTimestamp.get(state.type) || 0;
      const now = Date.now();

      if (state.active && !previouslyActive && now - lastAlertTime >= 15 * 60 * 1000) {
        await this.handleEventStarted(state);
      } else if (!state.active && previouslyActive) {
        this.lastAlertedStatus.set(state.type, false);
        this.clearUpcomingCycle(state.type);
      }
    }
  }

  public async handleEventUpcoming(state: SkyPvPEventState): Promise<void> {
    const minutes = state.startsInMinutes ?? 5;
    const alertKey = `${state.type}:${minutes}`;
    const currentlyAlerting = this.isUpcomingAlerting.get(alertKey) ?? false;

    // Strict deduplication: Each minute announcement (e.g. 10m or 5m) fires exactly once per event cycle
    if (this.alertedUpcomingCycles.has(alertKey) || currentlyAlerting) {
      log.debug({ event: state.name, alertKey }, 'Skipping duplicate pre-event early warning');
      return;
    }

    this.isUpcomingAlerting.set(alertKey, true);
    this.alertedUpcomingCycles.add(alertKey);
    state.upcomingAlertSent = true;

    try {
      log.info({ event: state.name, startsInMinutes: minutes }, `Broadcasting pre-event ${minutes}-minute early warning`);
      await this.broadcastEventEarlyWarning(state);
    } finally {
      this.isUpcomingAlerting.set(alertKey, false);
    }
  }

  public async handleEventStarted(state: SkyPvPEventState): Promise<void> {
    const now = Date.now();
    const previouslyActive = this.lastAlertedStatus.get(state.type) ?? false;
    const currentlyAlerting = this.isAlerting.get(state.type) ?? false;
    const lastAlertTime = this.lastAlertedTimestamp.get(state.type) || 0;

    // Strict deduplication: If already active, currently alerting, or alerted within last 15 minutes
    if (previouslyActive || currentlyAlerting || now - lastAlertTime < 15 * 60 * 1000) {
      log.debug({ event: state.name }, 'Skipping duplicate event start alert');
      return;
    }

    // Set alerting lock, active status, and timestamp IMMEDIATELY before starting the async broadcast
    this.isAlerting.set(state.type, true);
    this.lastAlertedStatus.set(state.type, true);
    this.lastAlertedTimestamp.set(state.type, now);

    // Clean up upcoming cycle tracking for this event now that it has started
    this.clearUpcomingCycle(state.type);
    state.upcoming = false;
    state.upcomingAlertSent = false;
    state.alertedMinutes?.clear();

    try {
      log.info({ event: state.name }, 'New SkyPvP event start detected! Broadcasting notification.');
      await this.broadcastEventStart(state);

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
    } finally {
      this.isAlerting.set(state.type, false);
    }
  }

  private async broadcastEventEarlyWarning(state: SkyPvPEventState): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        eventNotificationsEnabled: true,
      },
    });

    const minutes = state.startsInMinutes ?? 5;
    const estTimestamp = Math.floor(Date.now() / 1000) + minutes * 60;

    for (const config of configs) {
      const targetChannelId = this.getChannelIdForEvent(config, state.type) || config.eventChannelId;
      if (!targetChannelId) continue;

      try {
        const channel = await client.channels.fetch(targetChannelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

        // Determine specific role for this event
        const roleId = this.getRoleIdForEvent(config, state.type);
        const roleMention = roleId ? `<@&${roleId}>` : '';

        const embed = infoEmbed(
          `⏳ Upcoming SkyPvP Event: ${state.name}`,
          `⚠️ **${state.name}** is starting in **${minutes} minutes**!\nGet ready, equip your kits, gear, and potions!`
        );
        embed.setColor(COLORS.WARNING);

        embed.addFields([
          { name: 'Event Name', value: state.name, inline: true },
          { name: 'Starts In', value: `⏳ **${minutes} minutes**`, inline: true },
          { name: 'Estimated Start', value: `<t:${estTimestamp}:T> (<t:${estTimestamp}:R>)`, inline: true },
        ]);

        if (state.details) {
          embed.addFields({ name: 'In-Game Notice', value: state.details, inline: false });
        }

        embed.setFooter({ text: 'SkyPvP Utils • Early Event Alert' });

        await (channel as any).send({
          content: roleMention ? roleMention : undefined,
          embeds: [embed],
        });
        log.info(
          { guildId: config.guildId, channelId: targetChannelId, event: state.name, minutes },
          'Delivered pre-event early warning notification to Discord channel'
        );
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to deliver pre-event notification');
      }
    }
  }

  private async broadcastEventStart(state: SkyPvPEventState): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        eventNotificationsEnabled: true,
      },
    });

    for (const config of configs) {
      const targetChannelId = this.getChannelIdForEvent(config, state.type) || config.eventChannelId;
      if (!targetChannelId) continue;

      try {
        const channel = await client.channels.fetch(targetChannelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

        // Embed only on event start — role ping is sent exclusively during the 5m pre-alert
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

        embed.setFooter({ text: 'SkyPvP Utils • Event Started' });

        await (channel as any).send({
          embeds: [embed],
        });
        log.info(
          { guildId: config.guildId, channelId: targetChannelId, event: state.name },
          'Delivered event notification to Discord channel (embed only, no role ping)'
        );
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to deliver event notification');
      }
    }
  }

  public getChannelIdForEvent(config: any, type: SkyPvPEventType): string | null {
    switch (type) {
      case 'FLORAL_FORTUNE':
        return config.floralFortuneChannelId;
      case 'ENVOY_DROPS':
        return config.envoyDropsChannelId;
      case 'BLOOD_LUST':
        return config.bloodLustChannelId;
      case 'GOLD_RUSH':
        return config.goldRushChannelId;
      case 'HARD_POINT':
        return config.hardPointChannelId;
      case 'KOTL':
        return config.kotlChannelId;
      default:
        return null;
    }
  }

  public getRoleIdForEvent(config: any, type: SkyPvPEventType): string | null {
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
