import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { outpostProvider, type OutpostInfo } from '../providers/outpost.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('outpost-service');

export class OutpostService {
  /**
   * Update the live outpost embed in all configured channels (edit in-place, zero pings)
   */
  public async updateLiveEmbed(): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        outpostMonitoringEnabled: true,
        outpostChannelId: { not: null },
      },
    });

    if (configs.length === 0) return;

    const outposts = outpostProvider.getOutposts();
    const embed = this.buildOutpostEmbed(outposts);

    // Save to DB
    for (const op of outposts) {
      try {
        await prisma.outpostRecord.upsert({
          where: { outpostName: op.type as any },
          update: {
            status: op.status as any,
            controllingTeam: op.controllingTeam,
            capturingPlayer: op.capturingPlayer,
            lastCheckedAt: new Date(),
          },
          create: {
            outpostName: op.type as any,
            status: op.status as any,
            controllingTeam: op.controllingTeam,
            capturingPlayer: op.capturingPlayer,
          },
        });
      } catch (err: any) {
        log.warn({ outpost: op.name, err: err?.message }, 'Failed to persist outpost record in DB');
      }
    }

    // Update Discord message in each configured guild
    for (const config of configs) {
      if (!config.outpostChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.outpostChannelId);
        if (!channel || !channel.isTextBased()) continue;

        let messageUpdated = false;

        if (config.outpostMessageId) {
          try {
            const existingMessage = await (channel as any).messages.fetch(config.outpostMessageId);
            if (existingMessage) {
              await existingMessage.edit({ embeds: [embed] });
              messageUpdated = true;
            }
          } catch (_) {
            // Message was likely deleted manually, fallback to sending a new one
          }
        }

        if (!messageUpdated && 'send' in channel) {
          const sent = await (channel as any).send({ embeds: [embed] });
          await prisma.guildConfig.update({
            where: { id: config.id },
            data: { outpostMessageId: sent.id },
          });
        }
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to update live outpost embed');
      }
    }
  }

  private buildOutpostEmbed(outposts: OutpostInfo[]) {
    const embed = infoEmbed(
      '🏰 SkyPvP Outpost Control Board',
      'Live control and status for all four SkyPvP outposts.\n*This message updates automatically in-place (No Role Pings).*'
    );
    embed.setColor(COLORS.OUTPOST);

    for (const op of outposts) {
      const statusIcon =
        op.status === 'AVAILABLE'
          ? '🟢 Available'
          : op.status === 'CAPTURING'
          ? '⚔️ Being Captured'
          : op.status === 'CAPTURED'
          ? '🛡️ Controlled'
          : '⏳ Cooldown';

      const team = op.controllingTeam ? `\`${op.controllingTeam}\`` : 'None / Neutral';
      const capping = op.capturingPlayer ? `\`${op.capturingPlayer}\`` : 'None';

      embed.addFields({
        name: `📍 ${op.name}`,
        value:
          `**Status**: ${statusIcon}\n` +
          `**Controlling Team**: ${team}\n` +
          `**Current Capper**: ${capping}\n` +
          `**Last Updated**: <t:${Math.floor(op.lastUpdated.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    return embed;
  }
}

export const outpostService = new OutpostService();
