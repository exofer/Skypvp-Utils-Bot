import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';

export const updatesOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerupdates')
    .setDescription('Configure destination channel for /updatelogs release announcements')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the updates publication channel')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current updates channel')
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove configured updates channel')
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    let config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesChannelId: channel.id },
      });

      await interaction.editReply({
        embeds: [successEmbed('Updates Channel Set', `Release logs will be published to <#${channel.id}>.`)],
      });
    } else if (sub === 'view') {
      const channelStr = config.updatesChannelId ? `<#${config.updatesChannelId}>` : '`Not Set`';
      await interaction.editReply({
        embeds: [infoEmbed('Release Updates Channel', `**Current Destination**: ${channelStr}`)],
      });
    } else if (sub === 'remove') {
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesChannelId: null },
      });
      await interaction.editReply({
        embeds: [successEmbed('Cleared', 'Updates destination channel removed.')],
      });
    }
  },
};
