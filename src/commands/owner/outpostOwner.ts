import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { outpostService } from '../../services/outpost.js';
import { outpostObserver } from '../../mineflayer/observers/outpost.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { outpostMonitorQueue } from '../../jobs/queues.js';
import { redis } from '../../utils/redis.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';

export const outpostOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('owneroutpost')
    .setDescription('Configure Outpost monitoring channel and polling intervals')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set channel for live continuous outpost board')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('interval')
        .setDescription('Configure background outpost monitoring polling interval')
        .addIntegerOption((opt) =>
          opt
            .setName('seconds')
            .setDescription('Polling interval in seconds (30 to 600)')
            .setMinValue(30)
            .setMaxValue(600)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Toggle Outpost monitoring')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('refresh').setDescription('Force an immediate refresh of the outpost embed')
    )
    .addSubcommand((sub) =>
      sub.setName('inspect').setDescription('Trigger runtime inventory inspection (./outposts) with diagnostic logging')
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { outpostChannelId: channel.id, outpostMonitoringEnabled: true, outpostMessageId: null },
        create: { guildId, outpostChannelId: channel.id, outpostMonitoringEnabled: true },
      });

      await outpostService.updateLiveEmbed(true);

      await interaction.editReply({
        embeds: [successEmbed('Outpost Channel Set', `Live outpost board created in <#${channel.id}>.`)],
      });
    } else if (sub === 'interval') {
      const seconds = interaction.options.getInteger('seconds', true);
      const intervalMs = seconds * 1000;

      // Persist in Redis
      try {
        await redis.set('config:outpost_interval_ms', String(intervalMs));
      } catch (_) {}

      // Update BullMQ Job Scheduler
      try {
        await outpostMonitorQueue.upsertJobScheduler(
          'outpost-monitor-scheduler',
          { every: intervalMs },
          { name: 'monitor-outposts' }
        );
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Failed to update scheduler', err?.message || 'Scheduler error')],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Outpost Interval Updated',
            `Background Outpost GUI monitoring will run every **${seconds} seconds** (${Math.round(seconds / 60 * 10) / 10} min).`
          ),
        ],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { outpostMonitoringEnabled: enabled },
        create: { guildId, outpostMonitoringEnabled: enabled },
      });
      await interaction.editReply({
        embeds: [successEmbed('Outpost Toggle', `Outpost monitoring is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    } else if (sub === 'refresh') {
      await outpostService.updateLiveEmbed(true);
      await interaction.editReply({
        embeds: [successEmbed('Outpost Refreshed', 'Outpost board updated from live in-game data.')],
      });
    } else if (sub === 'inspect') {
      if (!mineflayerManager.isConnected()) {
        await interaction.editReply({
          embeds: [errorEmbed('Bot Disconnected', 'Mineflayer bot is not connected to SkyPvP. Connect it first via `/owneraccount test`.')],
        });
        return;
      }

      const results = await outpostObserver.scrapeOutposts(true);
      const lines = results.map((r) => {
        const teamStr = r.controllingTeam ? ` (Team: ${r.controllingTeam})` : '';
        const capStr = r.capturingPlayer ? ` [Capturing: ${r.capturingPlayer} ${r.captureProgress ?? 0}%]` : '';
        return `• **${r.name}**: \`${r.status}\`${teamStr}${capStr}`;
      });

      const embed = infoEmbed(
        'Outpost Runtime Diagnostic Data',
        lines.length > 0
          ? `Captured **${results.length}** outposts from Warzone Events GUI:\n\n${lines.join('\n')}`
          : '⚠️ Could not read outposts. Check server logs for full window dump.'
      );

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
