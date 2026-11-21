import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import { outpostProvider, type OutpostInfo, type OutpostType } from '../providers/outpost.js';
import { mineflayerManager } from '../mineflayer/client.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('outpost-service');

export class OutpostService {
  private lastStoredStates = new Map<
    OutpostType,
    { status: string; team?: string; capper?: string; progress?: number; cooldown?: string }
  >();

  /**
   * Update the live outpost embed in all configured channels (edit in-place, zero pings)
   */
  public async updateLiveEmbed(forceUpdate = false, diagnosticMode?: boolean): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        outpostMonitoringEnabled: true,
        outpostChannelId: { not: null },
      },
    });

    // 1. Fetch current states (scrapes GUI if Mineflayer connected; otherwise preserves last valid state)
    const outposts = await outpostProvider.fetchOutposts(diagnosticMode);
    const isFresh = outpostProvider.hasFreshData();

    // 2. Hydrate lastStoredStates from DB if first run to prevent false initial transitions
    if (this.lastStoredStates.size === 0) {
      try {
        const existing = await prisma.outpostRecord.findMany();
        for (const rec of existing) {
          this.lastStoredStates.set(rec.outpostName as OutpostType, {
            status: rec.status,
            team: rec.controllingTeam ?? undefined,
            capper: rec.capturingPlayer ?? undefined,
            progress: rec.captureProgress ?? undefined,
            cooldown: undefined,
          });
        }
      } catch (err: any) {
        log.debug({ err: err?.message }, 'Failed to preload last stored outpost states');
      }
    }

    // 3. Detect meaningful state changes
    let hasAnyStateChanged = false;
    for (const op of outposts) {
      const prev = this.lastStoredStates.get(op.type);
      const isChanged =
        !prev ||
        prev.status !== op.status ||
        prev.team !== op.controllingTeam ||
        prev.capper !== op.capturingPlayer ||
        prev.progress !== op.captureProgress ||
        prev.cooldown !== op.cooldownRemaining;

      if (isChanged) {
        hasAnyStateChanged = true;
        log.info(
          {
            outpost: op.name,
            fromStatus: prev?.status,
            toStatus: op.status,
            team: op.controllingTeam,
            capper: op.capturingPlayer,
            progress: op.captureProgress,
            cooldown: op.cooldownRemaining,
          },
          'Outpost state change detected'
        );
        this.lastStoredStates.set(op.type, {
          status: op.status,
          team: op.controllingTeam,
          capper: op.capturingPlayer,
          progress: op.captureProgress,
          cooldown: op.cooldownRemaining,
        });
      }
    }

    // 4. Persist to DB ONLY if fresh data was scraped from server or chat state changed.
    // Do NOT overwrite existing DB records with AVAILABLE defaults when Mineflayer is disconnected.
    if (isFresh || (hasAnyStateChanged && mineflayerManager.isConnected())) {
      for (const op of outposts) {
        try {
          await prisma.outpostRecord.upsert({
            where: { outpostName: op.type },
            update: {
              status: op.status,
              controllingTeam: op.controllingTeam,
              owner: op.owner,
              capturingPlayer: op.capturingPlayer,
              captureProgress: op.captureProgress,
              cooldownEndsAt: op.cooldownEndsAt,
              lastCheckedAt: new Date(),
            },
            create: {
              outpostName: op.type,
              status: op.status,
              controllingTeam: op.controllingTeam,
              owner: op.owner,
              capturingPlayer: op.capturingPlayer,
              captureProgress: op.captureProgress,
              cooldownEndsAt: op.cooldownEndsAt,
            },
          });
        } catch (err: any) {
          log.warn({ outpost: op.name, err: err?.message }, 'Failed to persist outpost record in DB');
        }
      }
    }

    if (configs.length === 0) return;

    // 4. Build dashboard embed
    const embed = this.buildOutpostEmbed(outposts);

    // 5. Update Discord message in each configured guild
    for (const config of configs) {
      if (!config.outpostChannelId) continue;

      // Only update Discord if state changed, or forced, or no message created yet
      if (!hasAnyStateChanged && !forceUpdate && config.outpostMessageId) {
        continue;
      }

      try {
        const channel = await client.channels.fetch(config.outpostChannelId);
        if (!channel || !channel.isTextBased()) continue;

        let messageUpdated = false;

        if (config.outpostMessageId) {
          try {
            const existingMessage = await (channel as any).messages.fetch(config.outpostMessageId);
            if (existingMessage) {
              await existingMessage.edit({
                content: undefined,
                allowedMentions: { parse: [] },
                embeds: [embed],
              });
              messageUpdated = true;
            }
          } catch (_) {
            // Message was deleted or inaccessible, recreate safely
          }
        }

        if (!messageUpdated && 'send' in channel) {
          const sent = await (channel as any).send({
            content: undefined,
            allowedMentions: { parse: [] },
            embeds: [embed],
          });
          await prisma.guildConfig.update({
            where: { id: config.id },
            data: { outpostMessageId: sent.id },
          });
          log.info({ guildId: config.guildId, messageId: sent.id }, 'Created initial live outpost dashboard message');
        }
      } catch (err: any) {
        log.error({ guildId: config.guildId, err: err?.message }, 'Failed to update live outpost embed');
      }
    }
  }

  public buildOutpostEmbed(outposts: OutpostInfo[]) {
    const embed = infoEmbed(
      '🏰 SkyPvP Outpost Control Board',
      'Live control and status for all four Warzone Outposts.\n*This dashboard updates automatically in-place. (No Role Pings)*'
    );
    embed.setColor(COLORS.OUTPOST);

    const outpostMeta: Record<OutpostType, { emoji: string }> = {
      RESISTANCE: { emoji: '🛡️' },
      DAMAGE: { emoji: '⚔️' },
      LUCKYBLOCKS: { emoji: '📦' },
      SOULS: { emoji: '👻' },
    };

    for (const op of outposts) {
      const meta = outpostMeta[op.type] || { emoji: '📍' };

      const statusBadge =
        op.status === 'CAPTURED'
          ? '🟢 **Controlled**'
          : op.status === 'CAPTURING'
          ? '⚔️ **Contested / Capturing**'
          : op.status === 'COOLDOWN'
          ? '⏳ **On Cooldown (Free)**'
          : '🔴 **Free**';

      const teamStr = op.controllingTeam ? `\`${op.controllingTeam}\`` : '*Neutral / None*';
      const capperStr = op.capturingPlayer ? `\`${op.capturingPlayer}\`` : '*None*';
      const progressStr = op.captureProgress !== undefined ? `${op.captureProgress}%` : undefined;
      const cooldownStr = op.cooldownRemaining ? op.cooldownRemaining : undefined;

      let fieldValue =
        `**Status**: ${statusBadge}\n` +
        `**Controlling Team**: ${teamStr}\n`;

      if (op.location) {
        fieldValue += `**Location**: \`${op.location}\`\n`;
      }

      if (op.capturingPlayer || op.status === 'CAPTURING') {
        fieldValue += `**Capturing Player**: ${capperStr}\n`;
      }

      if (progressStr) {
        fieldValue += `**Capture Progress**: ${progressStr}\n`;
      }

      if (cooldownStr) {
        fieldValue += `**Cooldown**: ${cooldownStr}\n`;
      }

      fieldValue += `**Last Checked**: <t:${Math.floor(op.lastUpdated.getTime() / 1000)}:R>`;

      embed.addFields({
        name: `${meta.emoji} ${op.name}`,
        value: fieldValue,
        inline: true,
      });
    }

    embed.setFooter({ text: 'SkyPvP Utils • Outpost Monitor (/outposts)' });
    embed.setTimestamp();

    return embed;
  }
}

export const outpostService = new OutpostService();
