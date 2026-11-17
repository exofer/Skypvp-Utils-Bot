import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { successEmbed } from '../../utils/embeds.js';

export const kothOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerkoth')
    .setDescription('Configure KOTH notifications and shared role')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the dedicated KOTH notification channel')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role')
        .setDescription('Set the ONE shared role for East and West KOTH')
        .addRoleOption((opt) =>
          opt.setName('target_role').setDescription('Role to ping on KOTH start/capture').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Toggle KOTH notifications')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
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
        update: { kothChannelId: channel.id, kothNotificationsEnabled: true },
        create: { guildId, kothChannelId: channel.id, kothNotificationsEnabled: true },
      });
      await interaction.editReply({
        embeds: [successEmbed('KOTH Channel Set', `KOTH alerts will post to <#${channel.id}>.`)],
      });
    } else if (sub === 'role') {
      const role = interaction.options.getRole('target_role', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { kothRoleId: role.id },
        create: { guildId, kothRoleId: role.id },
      });
      await interaction.editReply({
        embeds: [successEmbed('KOTH Role Set', `Shared KOTH role set to <@&${role.id}>.`)],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { kothNotificationsEnabled: enabled },
        create: { guildId, kothNotificationsEnabled: enabled },
      });
      await interaction.editReply({
        embeds: [successEmbed('KOTH Toggle', `KOTH notifications are now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    }
  },
};
