import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';

export const configCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure server channels, roles, and alert monitors')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current server configuration overview')
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set a notification or feed channel')
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setDescription('The feature or event channel to set')
            .setRequired(true)
            .addChoices(
              { name: 'SkyPvP Events (General/Default)', value: 'eventChannelId' },
              { name: 'Floral Fortune', value: 'floralFortuneChannelId' },
              { name: 'Envoy Drops', value: 'envoyDropsChannelId' },
              { name: 'Blood Lust', value: 'bloodLustChannelId' },
              { name: 'Gold Rush', value: 'goldRushChannelId' },
              { name: 'Hard Point', value: 'hardPointChannelId' },
              { name: 'KoTL', value: 'kotlChannelId' },
              { name: 'KOTH Alerts', value: 'kothChannelId' },
              { name: 'Stronghold Alerts', value: 'strongholdChannelId' },
              { name: 'Outpost Board', value: 'outpostChannelId' },
              { name: 'Chat Bridge', value: 'chatBridgeChannelId' },
              { name: 'Auction Feed', value: 'auctionFeedChannelId' },
              { name: 'Update Releases', value: 'updatesChannelId' }
            )
        )
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('The destination channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Set a role ping for an event or alert')
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setDescription('The feature or event role to bind')
            .setRequired(true)
            .addChoices(
              { name: 'Shared KOTH Role (East & West)', value: 'kothRoleId' },
              { name: 'Stronghold Role', value: 'strongholdRoleId' },
              { name: 'Floral Fortune', value: 'floralFortuneRoleId' },
              { name: 'Envoy Drops', value: 'envoyDropsRoleId' },
              { name: 'Blood Lust', value: 'bloodLustRoleId' },
              { name: 'Gold Rush', value: 'goldRushRoleId' },
              { name: 'Hard Point', value: 'hardPointRoleId' },
              { name: 'KoTL', value: 'kotlRoleId' }
            )
        )
        .addRoleOption((opt) =>
          opt.setName('target_role').setDescription('The role to ping').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('alerts')
        .setDescription('Toggle notification systems on or off')
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setDescription('The notification system to toggle')
            .setRequired(true)
            .addChoices(
              { name: 'SkyPvP Events', value: 'eventNotificationsEnabled' },
              { name: 'KOTH Notifications', value: 'kothNotificationsEnabled' },
              { name: 'Stronghold Notifications', value: 'strongholdNotificationsEnabled' },
              { name: 'Outpost Monitoring', value: 'outpostMonitoringEnabled' },
              { name: 'Auction Feed', value: 'auctionFeedEnabled' },
              { name: 'Chat Bridge', value: 'chatBridgeEnabled' }
            )
        )
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable or disable').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('chat')
        .setDescription('Configure Minecraft public chat bridge channel and style')
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('The destination Discord channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('style')
            .setDescription('Display style')
            .setRequired(false)
            .addChoices(
              { name: 'ANSI Codeblock (Terminal Colors for Desktop)', value: 'ANSI' },
              { name: 'Embed Cards (Mobile & Desktop Friendly)', value: 'EMBED' },
              { name: 'Clean Markdown (Bold Text, no code box)', value: 'MARKDOWN' }
            )
        )
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable or disable the bridge').setRequired(false)
        )
    ),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ embeds: [errorEmbed('Guild Only', 'This command can only be used in a server.')], ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    let config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    if (sub === 'view') {
      const ch = (id: string | null | undefined) => (id ? `<#${id}>` : '`Not Set`');
      const r = (id: string | null | undefined) => (id ? `<@&${id}>` : '`Not Set`');
      const t = (val: boolean | undefined) => (val ? '🟢 Enabled' : '🔴 Disabled');

      const embed = infoEmbed(
        'Server Configuration Overview',
        'Configured channels, role bindings, and active monitors for this server.'
      );

      embed.addFields([
        {
          name: '📺 Notification Channels',
          value:
            `• **Auction Feed**: ${ch(config.auctionFeedChannelId)} (${t(config.auctionFeedEnabled)})\n` +
            `• **SkyPvP Events**: ${ch(config.eventChannelId)} (${t(config.eventNotificationsEnabled)})\n` +
            `  └ Floral Fortune: ${ch(config.floralFortuneChannelId || config.eventChannelId)}\n` +
            `  └ Envoy Drops: ${ch(config.envoyDropsChannelId || config.eventChannelId)}\n` +
            `  └ Blood Lust: ${ch(config.bloodLustChannelId || config.eventChannelId)}\n` +
            `  └ Gold Rush: ${ch(config.goldRushChannelId || config.eventChannelId)}\n` +
            `  └ Hard Point: ${ch(config.hardPointChannelId || config.eventChannelId)}\n` +
            `  └ KoTL: ${ch(config.kotlChannelId || config.eventChannelId)}\n` +
            `• **KOTH Alerts**: ${ch(config.kothChannelId)} (${t(config.kothNotificationsEnabled)})\n` +
            `• **Stronghold Alerts**: ${ch(config.strongholdChannelId)} (${t(config.strongholdNotificationsEnabled)})\n` +
            `• **Outpost Board**: ${ch(config.outpostChannelId)} (${t(config.outpostMonitoringEnabled)})\n` +
            `• **Chat Bridge**: ${ch(config.chatBridgeChannelId)} (${t(config.chatBridgeEnabled)} • Mode: \`${(config as any)?.chatBridgeStyle || 'ANSI'}\`)\n` +
            `• **Updates**: ${ch(config.updatesChannelId)}`,
          inline: false,
        },
        {
          name: '🔔 Role Ping Bindings',
          value:
            `• **Shared KOTH Role**: ${r(config.kothRoleId)}\n` +
            `• **Stronghold Role**: ${r(config.strongholdRoleId)}\n` +
            `• **Floral Fortune**: ${r(config.floralFortuneRoleId)}\n` +
            `• **Envoy Drops**: ${r(config.envoyDropsRoleId)}\n` +
            `• **Blood Lust**: ${r(config.bloodLustRoleId)}\n` +
            `• **Gold Rush**: ${r(config.goldRushRoleId)}\n` +
            `• **Hard Point**: ${r(config.hardPointRoleId)}\n` +
            `• **KoTL**: ${r(config.kotlRoleId)}`,
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'channel') {
      const feature = interaction.options.getString('feature', true);
      const channel = interaction.options.getChannel('target', true);

      config = await prisma.guildConfig.update({
        where: { guildId },
        data: { [feature]: channel.id },
      });

      await interaction.editReply({
        embeds: [successEmbed('Channel Configured', `Channel for **${feature}** set to <#${channel.id}>.`)],
      });
    } else if (sub === 'roles') {
      const feature = interaction.options.getString('feature', true);
      const role = interaction.options.getRole('target_role', true);

      config = await prisma.guildConfig.update({
        where: { guildId },
        data: { [feature]: role.id },
      });

      await interaction.editReply({
        embeds: [successEmbed('Role Configured', `Role ping for **${feature}** set to <@&${role.id}>.`)],
      });
    } else if (sub === 'alerts') {
      const feature = interaction.options.getString('feature', true);
      const enabled = interaction.options.getBoolean('enabled', true);

      config = await prisma.guildConfig.update({
        where: { guildId },
        data: { [feature]: enabled },
      });

      await interaction.editReply({
        embeds: [successEmbed('Alert Setting Updated', `Feature **${feature}** is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    } else if (sub === 'chat') {
      const channel = interaction.options.getChannel('target', true);
      const style = interaction.options.getString('style') || 'ANSI';
      const enabled = interaction.options.getBoolean('enabled') ?? true;

      config = await prisma.guildConfig.update({
        where: { guildId },
        data: {
          chatBridgeChannelId: channel.id,
          chatBridgeStyle: style,
          chatBridgeEnabled: enabled,
        },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Chat Bridge Configured',
            `Chat bridge channel set to <#${channel.id}>.\n` +
            `• **Mode**: \`${style}\`\n` +
            `• **Status**: **${enabled ? 'ENABLED' : 'DISABLED'}**`
          ),
        ],
      });
    }
  },
};
