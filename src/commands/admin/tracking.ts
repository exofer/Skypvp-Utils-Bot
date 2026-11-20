import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed } from '../../utils/embeds.js';

export const trackingCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('tracking')
    .setDescription('Server-wide player tracking overview and settings')
    .addSubcommand((sub) =>
      sub.setName('settings').setDescription('View player tracking settings and statistics')
    ),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'settings') {
      await interaction.deferReply({ ephemeral: true });

      const totalTracked = await prisma.trackedPlayer.count();
      const totalSnapshots = await prisma.playerSnapshot.count();
      const totalUsersTracking = await prisma.userProfile.count({
        where: { trackedPlayers: { some: {} } },
      });

      const embed = infoEmbed(
        'Player Tracking Overview & Settings',
        'Server-level and network-wide tracking statistics on PikaNetwork SkyPvP.'
      );

      embed.addFields([
        {
          name: '📊 Global Tracking Metrics',
          value:
            `• **Unique Players Tracked**: \`${totalTracked}\`\n` +
            `• **Historical Snapshots Recorded**: \`${totalSnapshots}\`\n` +
            `• **Users Actively Tracking**: \`${totalUsersTracking}\``,
          inline: false,
        },
        {
          name: '⚙️ System Configuration',
          value:
            `• **Snapshot Frequency**: Periodic background polling (every 5 minutes)\n` +
            `• **Data Source**: PikaNetwork Stats API (X-Api-Key authenticated)`,
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
