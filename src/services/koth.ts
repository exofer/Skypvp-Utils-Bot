import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { kothProvider, type KothState } from '../providers/koth.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('koth-service');

export class KothService {
  private lastStates = new Map<string, { active: boolean; capturedBy?: string }>();

  public async checkAndNotifyKoth(): Promise<void> {
    const states = kothProvider.getStates();

    for (const state of states) {
      const prev = this.lastStates.get(state.location);

      // KOTH Started / Became Active
      if (state.active && (!prev || !prev.active)) {
        log.info({ location: state.location }, 'KOTH active transition detected');
        await this.broadcastKothEvent(state, 'START');
        this.lastStates.set(state.location, { active: true, capturedBy: undefined });
      }
      // KOTH Captured
      else if (!state.active && prev && prev.active && state.capturedBy) {
        log.info({ location: state.location, winner: state.capturedBy }, 'KOTH captured transition detected');
        await this.broadcastKothEvent(state, 'CAPTURED');
        this.lastStates.set(state.location, { active: false, capturedBy: state.capturedBy });
      }
    }
  }

  private async broadcastKothEvent(state: KothState, eventType: 'START' | 'CAPTURED'): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        kothNotificationsEnabled: true,
        kothChannelId: { not: null },
      },
    });

    for (const config of configs) {
      if (!config.kothChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.kothChannelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

        const roleMention = config.kothRoleId ? `<@&${config.kothRoleId}>` : '';

        const title =
          eventType === 'START'
            ? `👑 ${state.name} is Now Active!`
            : `🏆 ${state.name} Captured!`;

        const desc =
          eventType === 'START'
            ? `**${state.name}** has started! Head to the capture point now.`
            : `**${state.name}** has been successfully captured by **${state.capturedBy || 'a player'}**!`;

        const embed = infoEmbed(title, desc);
        embed.setColor(COLORS.KOTH);

        embed.addFields([
          { name: 'Location', value: state.name, inline: true },
          { name: 'Status', value: eventType === 'START' ? '⚔️ Contested' : '✅ Captured', inline: true },
        ]);

        if (eventType === 'CAPTURED' && state.capturedBy) {
          embed.addFields({ name: 'Winner', value: `\`${state.capturedBy}\``, inline: true });
        }

        await (channel as any).send({
          content: roleMention ? roleMention : undefined,
          embeds: [embed],
        });
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to deliver KOTH alert');
      }
    }
  }
}

export const kothService = new KothService();
