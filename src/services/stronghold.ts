import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { strongholdProvider, type StrongholdState } from '../providers/stronghold.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('stronghold-service');

export class StrongholdService {
  private lastActive = false;
  private lastCapturedBy?: string;

  public async checkAndNotifyStronghold(): Promise<void> {
    const state = strongholdProvider.getState();

    // Stronghold started
    if (state.active && !this.lastActive) {
      log.info('Stronghold start transition detected');
      await this.broadcastStrongholdEvent(state, 'START');
      this.lastActive = true;
      this.lastCapturedBy = undefined;
    }
    // Stronghold captured
    else if (!state.active && this.lastActive && state.capturedBy && state.capturedBy !== this.lastCapturedBy) {
      log.info({ winner: state.capturedBy }, 'Stronghold captured transition detected');
      await this.broadcastStrongholdEvent(state, 'CAPTURED');
      this.lastActive = false;
      this.lastCapturedBy = state.capturedBy;
    }
  }

  private async broadcastStrongholdEvent(state: StrongholdState, type: 'START' | 'CAPTURED'): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        strongholdNotificationsEnabled: true,
        strongholdChannelId: { not: null },
      },
    });

    for (const config of configs) {
      if (!config.strongholdChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.strongholdChannelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

        const roleMention = config.strongholdRoleId ? `<@&${config.strongholdRoleId}>` : '';

        const title =
          type === 'START'
            ? '🏰 Stronghold Event Started!'
            : '🛡️ Stronghold Captured!';

        const desc =
          type === 'START'
            ? 'The **Stronghold** is now open for capture in SkyPvP!'
            : `The **Stronghold** was conquered by **${state.capturedBy || 'a player'}**!`;

        const embed = infoEmbed(title, desc);
        embed.setColor(COLORS.STRONGHOLD);

        embed.addFields([
          { name: 'Event', value: 'Stronghold', inline: true },
          { name: 'Status', value: type === 'START' ? '⚔️ Contested' : '✅ Captured', inline: true },
        ]);

        if (type === 'CAPTURED' && state.capturedBy) {
          embed.addFields({ name: 'Controlling Player', value: `\`${state.capturedBy}\``, inline: true });
        }

        await (channel as any).send({
          content: roleMention ? roleMention : undefined,
          embeds: [embed],
        });
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to deliver Stronghold alert');
      }
    }
  }
}

export const strongholdService = new StrongholdService();
