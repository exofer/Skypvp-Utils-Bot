import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed } from '../../utils/embeds.js';

export const setupCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Overview of all configured channels, roles, and feature toggles for this server'),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ ephemeral: true });

    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    const embed = infoEmbed(
      'SkyPvP Utils — Server Configuration Overview',
      'Configured channels, role bindings, and active monitors for this Discord server.'
    );

    const ch = (id: string | null | undefined) => (id ? `<#${id}>` : '`Not Set`');
    const r = (id: string | null | undefined) => (id ? `<@&${id}>` : '`Not Set`');
    const t = (val: boolean | undefined) => (val ? '🟢 Enabled' : '🔴 Disabled');

    embed.addFields([
      {
        name: '📺 Notification Channels',
        value:
          `• **Auction Feed**: ${ch(config?.auctionFeedChannelId)} (${t(config?.auctionFeedEnabled)})\n` +
          `• **SkyPvP Events (Default)**: ${ch(config?.eventChannelId)} (${t(config?.eventNotificationsEnabled)})\n` +
          `  └ Floral Fortune: ${ch(config?.floralFortuneChannelId || config?.eventChannelId)}\n` +
          `  └ Envoy Drops: ${ch(config?.envoyDropsChannelId || config?.eventChannelId)}\n` +
          `  └ Blood Lust: ${ch(config?.bloodLustChannelId || config?.eventChannelId)}\n` +
          `  └ Gold Rush: ${ch(config?.goldRushChannelId || config?.eventChannelId)}\n` +
          `  └ Hard Point: ${ch(config?.hardPointChannelId || config?.eventChannelId)}\n` +
          `  └ KOTL: ${ch(config?.kotlChannelId || config?.eventChannelId)}\n` +
          `• **KOTH Alerts**: ${ch(config?.kothChannelId)} (${t(config?.kothNotificationsEnabled)})\n` +
          `• **Stronghold Alerts**: ${ch(config?.strongholdChannelId)} (${t(config?.strongholdNotificationsEnabled)})\n` +
          `• **Outpost Board**: ${ch(config?.outpostChannelId)} (${t(config?.outpostMonitoringEnabled)})\n` +
          `• **Chat Bridge**: ${ch(config?.chatBridgeChannelId)} (${t(config?.chatBridgeEnabled)} • Mode: \`${(config as any)?.chatBridgeStyle || 'ANSI'}\`)\n` +
          `• **Update Logs**: ${ch(config?.updatesChannelId)}`,
        inline: false,
      },
      {
        name: '🔔 Role Ping Bindings',
        value:
          `• **Shared KOTH Role**: ${r(config?.kothRoleId)}\n` +
          `• **Stronghold Role**: ${r(config?.strongholdRoleId)}\n` +
          `• **Floral Fortune**: ${r(config?.floralFortuneRoleId)}\n` +
          `• **Envoy Drops**: ${r(config?.envoyDropsRoleId)}\n` +
          `• **Blood Lust**: ${r(config?.bloodLustRoleId)}\n` +
          `• **Gold Rush**: ${r(config?.goldRushRoleId)}\n` +
          `• **Hard Point**: ${r(config?.hardPointRoleId)}\n` +
          `• **KOTL**: ${r(config?.kotlRoleId)}`,
        inline: false,
      },
    ]);

    await interaction.editReply({ embeds: [embed] });
  },
};
