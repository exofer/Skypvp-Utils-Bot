import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { successEmbed } from '../../utils/embeds.js';

export const strongholdOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerstronghold')
    .setDescription('Configure Stronghold notification settings')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the Stronghold notification channel')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role')
        .setDescription('Set the Stronghold role (separate from KOTH)')
        .addRoleOption((opt) =>
          opt.setName('target_role').setDescription('Role to ping').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Toggle Stronghold notifications')
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
        update: { strongholdChannelId: channel.id, strongholdNotificationsEnabled: true },
        create: { guildId, strongholdChannelId: channel.id, strongholdNotificationsEnabled: true },
      });
      await interaction.editReply({
        embeds: [successEmbed('Stronghold Channel Set', `Stronghold alerts will post to <#${channel.id}>.`)],
      });
    } else if (sub === 'role') {
      const role = interaction.options.getRole('target_role', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { strongholdRoleId: role.id },
        create: { guildId, strongholdRoleId: role.id },
      });
      await interaction.editReply({
        embeds: [successEmbed('Stronghold Role Set', `Stronghold role set to <@&${role.id}>.`)],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { strongholdNotificationsEnabled: enabled },
        create: { guildId, strongholdNotificationsEnabled: enabled },
      });
      await interaction.editReply({
        embeds: [successEmbed('Stronghold Toggle', `Stronghold notifications are now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    }
  },
};
