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
        .setDescription('Set notification channel for all events or a specific event type')
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('Destination channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('event')
            .setDescription('Specific event type (leave empty for general/all SkyPvP events)')
            .setRequired(false)
            .addChoices(
              { name: 'All Events (Default / Fallback)', value: 'ALL' },
              { name: 'Floral Fortune', value: 'FLORAL_FORTUNE' },
              { name: 'Envoy Drops', value: 'ENVOY_DROPS' },
              { name: 'Blood Lust', value: 'BLOOD_LUST' },
              { name: 'Gold Rush', value: 'GOLD_RUSH' },
              { name: 'Hard Point', value: 'HARD_POINT' },
              { name: 'King of the Ladder (KOTL)', value: 'KOTL' },
              { name: 'KOTH (King of the Hill)', value: 'KOTH' },
              { name: 'Stronghold', value: 'STRONGHOLD' },
              { name: 'Outposts', value: 'OUTPOST' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear-channel')
        .setDescription('Remove dedicated channel override for an event type (reverts to default)')
        .addStringOption((opt) =>
          opt
            .setName('event')
            .setDescription('Event type to remove channel override from')
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
      const eventType = interaction.options.getString('event') || 'ALL';

      const updateData: Record<string, any> = {};
      let title = 'Event Channel Configured';
      let desc = '';

      switch (eventType) {
        case 'FLORAL_FORTUNE':
          updateData.floralFortuneChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **Floral Fortune** alerts set to <#${channel.id}>.`;
          break;
        case 'ENVOY_DROPS':
          updateData.envoyDropsChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **Envoy Drops** alerts set to <#${channel.id}>.`;
          break;
        case 'BLOOD_LUST':
          updateData.bloodLustChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **Blood Lust** alerts set to <#${channel.id}>.`;
          break;
        case 'GOLD_RUSH':
          updateData.goldRushChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **Gold Rush** alerts set to <#${channel.id}>.`;
          break;
        case 'HARD_POINT':
          updateData.hardPointChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **Hard Point** alerts set to <#${channel.id}>.`;
          break;
        case 'KOTL':
          updateData.kotlChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Dedicated channel for **King of the Ladder (KOTL)** alerts set to <#${channel.id}>.`;
          break;
        case 'KOTH':
          updateData.kothChannelId = channel.id;
          updateData.kothNotificationsEnabled = true;
          desc = `Channel for **KOTH** alerts set to <#${channel.id}>.`;
          break;
        case 'STRONGHOLD':
          updateData.strongholdChannelId = channel.id;
          updateData.strongholdNotificationsEnabled = true;
          desc = `Channel for **Stronghold** alerts set to <#${channel.id}>.`;
          break;
        case 'OUTPOST':
          updateData.outpostChannelId = channel.id;
          updateData.outpostMonitoringEnabled = true;
          desc = `Channel for **Outpost Board** set to <#${channel.id}>.`;
          break;
        case 'ALL':
        default:
          updateData.eventChannelId = channel.id;
          updateData.eventNotificationsEnabled = true;
          desc = `Default/Fallback channel for **SkyPvP Events** set to <#${channel.id}>.`;
          break;
      }

      await prisma.guildConfig.upsert({
        where: { guildId },
        update: updateData,
        create: { guildId, ...updateData },
      });

      await interaction.editReply({
        embeds: [successEmbed(title, desc)],
      });
    } else if (sub === 'clear-channel') {
      const eventType = interaction.options.getString('event', true);
      const updateData: Record<string, any> = {};

      switch (eventType) {
        case 'FLORAL_FORTUNE':
          updateData.floralFortuneChannelId = null;
          break;
        case 'ENVOY_DROPS':
          updateData.envoyDropsChannelId = null;
          break;
        case 'BLOOD_LUST':
          updateData.bloodLustChannelId = null;
          break;
        case 'GOLD_RUSH':
          updateData.goldRushChannelId = null;
          break;
        case 'HARD_POINT':
          updateData.hardPointChannelId = null;
          break;
        case 'KOTL':
          updateData.kotlChannelId = null;
          break;
      }

      await prisma.guildConfig.update({
        where: { guildId },
        data: updateData,
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Channel Override Cleared',
            `Removed custom channel override for **${eventType}**. It will now use the default SkyPvP events channel.`
          ),
        ],
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
