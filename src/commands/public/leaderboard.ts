import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getLeaderboard } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const leaderboardCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the SkyPvP leaderboard on PikaNetwork')
    .addStringOption((opt) =>
      opt
        .setName('stat')
        .setDescription('Leaderboard metric')
        .setRequired(false)
        .addChoices(
          { name: 'Balance / Baltop', value: 'balance' },
          { name: 'Kills', value: 'kills' },
          { name: 'Deaths', value: 'deaths' },
          { name: 'Wins', value: 'wins' },
          { name: 'Highest Killstreak', value: 'highest_killstreak' },
          { name: 'Bounty', value: 'bounty' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('interval')
        .setDescription('Timeframe')
        .setRequired(false)
        .addChoices(
          { name: 'All Time (Total)', value: 'total' },
          { name: 'Monthly', value: 'monthly' },
          { name: 'Weekly', value: 'weekly' }
        )
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const stat = interaction.options.getString('stat') || 'kills';
    const interval = (interaction.options.getString('interval') as 'total' | 'monthly' | 'weekly') || 'total';

    await interaction.deferReply();

    try {
      const data = await getLeaderboard(stat, interval, 0, 10);
      const entries = data.entries || [];

      const isBalance = stat === 'balance' || stat === 'baltop' || stat === 'baltops';
      const isBounty = stat === 'bounty';
      const titleName = isBalance ? 'BALTOP (Balance)' : stat.toUpperCase();

      const embed = infoEmbed(
        `🏆 SkyPvP Leaderboard: ${titleName}`,
        `Top 10 players for **${isBalance ? 'in-game balance' : stat}** (${interval.toUpperCase()}) on PikaNetwork SkyPvP.`
      );

      if (entries.length === 0) {
        embed.setDescription('No entries found for this leaderboard.');
      } else {
        const lines = entries.map((e, idx) => {
          const rank = e.place || idx + 1;
          const name = e.user?.username || e.id || 'Unknown';
          const prefix = isBalance || isBounty ? '$' : '';
          const val = `${prefix}${formatNumber(e.value)}`;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;
          return `${medal} **${name}** — \`${val}\``;
        });

        embed.addFields({ name: 'Rankings', value: lines.join('\n') });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Leaderboard Error', err.message || 'Failed to retrieve leaderboard data.')],
      });
    }
  },
};
