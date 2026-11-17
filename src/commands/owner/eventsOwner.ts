import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

export const eventsOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerevents')
    .setDescription('Configure SkyPvP event notification channels and role pings')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the event notification channel')
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('Destination channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role')
        .setDescription('Set the ping role for a specific event')
        .addStringOption((opt) =>
          opt
            .setName('event')
            .setDescription('The event to assign a role to')
            .setRequired(true)
            .addChoices(
              { name: 'Floral Fortune', value: 'FLORAL_FORTUNE' },
              { name: 'Envoy Drops', value: 'ENVOY_DROPS' },
              { name: 'Blood Lust', value: 'BLOOD_LUST' },
              { name: 'Gold Rush', value: 'GOLD_RUSH' },
              { name: 'Hard Point', value: 'HARD_POINT' },
              { name: 'King of the Ladder (KOTL)', value: 'KOTL' }
            )
        )
        .addRoleOption((opt) =>
          opt.setName('target_role').setDescription('Role to ping').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable event alerts')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable or disable').setRequired(true)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Must be executed in a guild.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { eventChannelId: channel.id, eventNotificationsEnabled: true },
        create: { guildId, eventChannelId: channel.id, eventNotificationsEnabled: true },
      });

      await interaction.editReply({
        embeds: [successEmbed('Event Channel Set', `Event notifications will be posted to <#${channel.id}>.`)],
      });
    } else if (sub === 'role') {
      const eventType = interaction.options.getString('event', true);
      const role = interaction.options.getRole('target_role', true);

      const updateData: Record<string, string> = {};
      if (eventType === 'FLORAL_FORTUNE') updateData.floralFortuneRoleId = role.id;
      if (eventType === 'ENVOY_DROPS') updateData.envoyDropsRoleId = role.id;
      if (eventType === 'BLOOD_LUST') updateData.bloodLustRoleId = role.id;
      if (eventType === 'GOLD_RUSH') updateData.goldRushRoleId = role.id;
      if (eventType === 'HARD_POINT') updateData.hardPointRoleId = role.id;
      if (eventType === 'KOTL') updateData.kotlRoleId = role.id;

      await prisma.guildConfig.upsert({
        where: { guildId },
        update: updateData,
        create: { guildId, ...updateData },
      });

      await interaction.editReply({
        embeds: [successEmbed('Role Assigned', `Assigned <@&${role.id}> to **${eventType}** alerts.`)],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { eventNotificationsEnabled: enabled },
        create: { guildId, eventNotificationsEnabled: enabled },
      });

      await interaction.editReply({
        embeds: [successEmbed('Event Alerts', `Event notifications are now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    }
  },
};
