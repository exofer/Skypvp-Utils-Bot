import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getPlayerStats } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const statsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View SkyPvP statistics for a player')
    .addStringOption((opt) =>
      opt.setName('username').setDescription('The Minecraft username').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('interval')
        .setDescription('Statistics interval window')
        .setRequired(false)
        .addChoices(
          { name: 'All Time (Total)', value: 'total' },
          { name: 'Monthly', value: 'monthly' },
          { name: 'Weekly', value: 'weekly' }
        )
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const username = interaction.options.getString('username', true);
    const interval = (interaction.options.getString('interval') as 'total' | 'monthly' | 'weekly') || 'total';

    await interaction.deferReply();

    try {
      const stats = await getPlayerStats(username, interval);

      const embed = infoEmbed(
        `SkyPvP Statistics: ${username}`,
        `Viewing **${interval.toUpperCase()}** SkyPvP performance on PikaNetwork.`
      );

      embed.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/100`);

      const getStat = (name: string): { val: string; place: string } => {
        const block = stats[name];
        const val = block?.entries?.[0]?.value;
        const place = block?.entries?.[0]?.place;
        return {
          val: val !== undefined ? formatNumber(val) : '0',
          place: place ? `#${formatNumber(place)}` : 'Unranked',
        };
      };

      const kills = getStat('Kills');
      const deaths = getStat('Deaths');
      const killVal = parseFloat(kills.val.replace(/,/g, '')) || 0;
      const deathVal = parseFloat(deaths.val.replace(/,/g, '')) || 0;
      const kdr = deathVal > 0 ? (killVal / deathVal).toFixed(2) : killVal.toFixed(2);

      const streak = getStat('Highest Killstreak');
      const bounty = getStat('Bounty');
      const wins = getStat('Wins');
      const losses = getStat('Losses');
      const arrowsShot = getStat('Arrows shot');
      const arrowsHit = getStat('Arrows hit');

      embed.addFields([
        { name: '⚔️ Kills', value: `${kills.val} (${kills.place})`, inline: true },
        { name: '☠️ Deaths', value: `${deaths.val} (${deaths.place})`, inline: true },
        { name: '📊 K/D Ratio', value: `${kdr}`, inline: true },
        { name: '🔥 Best Streak', value: `${streak.val} (${streak.place})`, inline: true },
        { name: '💰 Bounty', value: `${bounty.val} (${bounty.place})`, inline: true },
        { name: '🏆 Wins', value: `${wins.val} (${wins.place})`, inline: true },
        { name: '💀 Losses', value: `${losses.val} (${losses.place})`, inline: true },
        { name: '🏹 Arrows Shot', value: `${arrowsShot.val}`, inline: true },
        { name: '🎯 Arrows Hit', value: `${arrowsHit.val}`, inline: true },
      ]);

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      if (err.statusCode === 404) {
        await interaction.editReply({
          embeds: [errorEmbed('Player Not Found', `No stats found for \`${username}\` in SkyPvP.`)],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', err.message || 'Failed to fetch player stats.')],
        });
      }
    }
  },
};
