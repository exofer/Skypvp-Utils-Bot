import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getPlayerStats } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const compareCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare SkyPvP stats of two players head-to-head')
    .addStringOption((opt) =>
      opt.setName('player1').setDescription('First player username').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('player2').setDescription('Second player username').setRequired(true)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const player1 = interaction.options.getString('player1', true);
    const player2 = interaction.options.getString('player2', true);

    await interaction.deferReply();

    try {
      const [stats1, stats2] = await Promise.all([
        getPlayerStats(player1, 'total'),
        getPlayerStats(player2, 'total'),
      ]);

      const getNum = (stats: any, name: string): number => {
        const val = stats[name]?.entries?.[0]?.value;
        return val ? parseFloat(String(val).replace(/,/g, '')) || 0 : 0;
      };

      const k1 = getNum(stats1, 'Kills');
      const k2 = getNum(stats2, 'Kills');

      const d1 = getNum(stats1, 'Deaths');
      const d2 = getNum(stats2, 'Deaths');

      const kdr1 = d1 > 0 ? (k1 / d1).toFixed(2) : k1.toFixed(2);
      const kdr2 = d2 > 0 ? (k2 / d2).toFixed(2) : k2.toFixed(2);

      const s1 = getNum(stats1, 'Highest Killstreak');
      const s2 = getNum(stats2, 'Highest Killstreak');

      const w1 = getNum(stats1, 'Wins');
      const w2 = getNum(stats2, 'Wins');

      const embed = infoEmbed(
        `SkyPvP Head-to-Head: ${player1} vs ${player2}`,
        `Comparing all-time SkyPvP stats between **${player1}** and **${player2}**.`
      );

      const formatLine = (label: string, v1: string | number, v2: string | number) => {
        return `**${label}**\n${player1}: \`${v1}\`\n${player2}: \`${v2}\``;
      };

      embed.addFields([
        { name: '⚔️ Kills', value: formatLine('Kills', formatNumber(k1), formatNumber(k2)), inline: true },
        { name: '☠️ Deaths', value: formatLine('Deaths', formatNumber(d1), formatNumber(d2)), inline: true },
        { name: '📊 KDR', value: formatLine('K/D Ratio', kdr1, kdr2), inline: true },
        { name: '🔥 Best Streak', value: formatLine('Streak', formatNumber(s1), formatNumber(s2)), inline: true },
        { name: '🏆 Wins', value: formatLine('Wins', formatNumber(w1), formatNumber(w2)), inline: true },
      ]);

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Comparison Failed', err.message || 'Could not fetch stats for both players.')],
      });
    }
  },
};
