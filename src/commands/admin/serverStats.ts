import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { client } from '../../bot.js';
import { infoEmbed } from '../../utils/embeds.js';

export const serverStatsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Discord server and SkyPvP bot metrics')
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View stats and configuration health for this Discord server')
    ),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'stats') {
      await interaction.deferReply({ ephemeral: true });

      const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
      const memberCount = guild.memberCount;
      const wsPing = client.ws.ping;
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);

      // Count active channels
      let activeChannels = 0;
      if (config?.eventChannelId) activeChannels++;
      if (config?.kothChannelId) activeChannels++;
      if (config?.strongholdChannelId) activeChannels++;
      if (config?.outpostChannelId) activeChannels++;
      if (config?.chatBridgeChannelId) activeChannels++;
      if (config?.auctionFeedChannelId) activeChannels++;
      if (config?.updatesChannelId) activeChannels++;

      const embed = infoEmbed(
        `Server Statistics: ${guild.name}`,
        `Operational status and configuration summary for **${guild.name}**.`
      );

      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL()!);
      }

      embed.addFields([
        {
          name: '🏰 Discord Server',
          value:
            `• **Server ID**: \`${guild.id}\`\n` +
            `• **Members**: \`${memberCount}\`\n` +
            `• **Owner**: <@${guild.ownerId}>`,
          inline: true,
        },
        {
          name: '🤖 Bot Health',
          value:
            `• **WebSocket Latency**: \`${wsPing}ms\`\n` +
            `• **Process Uptime**: \`${hours}h ${minutes}m\`\n` +
            `• **Environment**: \`${process.env.NODE_ENV || 'production'}\``,
          inline: true,
        },
        {
          name: '📡 Configured Services',
          value:
            `• **Active Channel Bindings**: \`${activeChannels}/7\`\n` +
            `• **Event Alerts**: ${config?.eventNotificationsEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
            `• **KOTH Alerts**: ${config?.kothNotificationsEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
            `• **Stronghold**: ${config?.strongholdNotificationsEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
            `• **Outpost Monitor**: ${config?.outpostMonitoringEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
            `• **Chat Bridge**: ${config?.chatBridgeEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
            `• **Auction Feed**: ${config?.auctionFeedEnabled ? '🟢 Enabled' : '🔴 Disabled'}`,
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
