import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { outpostService } from '../../services/outpost.js';
import { successEmbed } from '../../utils/embeds.js';

export const outpostOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('owneroutpost')
    .setDescription('Configure Outpost monitoring channel')
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
        .setName('toggle')
        .setDescription('Toggle Outpost monitoring')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('refresh').setDescription('Force an immediate refresh of the outpost embed')
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

      await outpostService.updateLiveEmbed();

      await interaction.editReply({
        embeds: [successEmbed('Outpost Channel Set', `Live outpost board created in <#${channel.id}>.`)],
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
      await outpostService.updateLiveEmbed();
      await interaction.editReply({
        embeds: [successEmbed('Outpost Refreshed', 'Outpost board updated.')],
      });
    }
  },
};
