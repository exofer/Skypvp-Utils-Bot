import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getProfile, getPlayerStats } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';
import { COLORS } from '../../config/constants.js';

export const balCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription("Check a player's in-game SkyPvP balance and baltop ranking")
    .addStringOption((opt) =>
      opt.setName('username').setDescription('The Minecraft username of the player').setRequired(true)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();

    try {
      const [profile, stats] = await Promise.all([
        getProfile(username).catch(() => null),
        getPlayerStats(username, 'total').catch(() => null),
      ]);

      if (!profile && !stats) {
        await interaction.editReply({
          embeds: [errorEmbed('Player Not Found', `No profile or SkyPvP data found for **${username}** on PikaNetwork.`)],
        });
        return;
      }

      const displayName = profile?.username || username;
      const balBlock = stats?.['Balance'];
      const rawBal = balBlock?.entries?.[0]?.value;
      const balNum = rawBal !== undefined ? parseFloat(String(rawBal)) : 0;
      const rank = balBlock?.entries?.[0]?.place;
      const totalPlayers = balBlock?.metadata?.total || 0;

      const embed = infoEmbed(
        `💰 SkyPvP Balance: ${displayName}`,
        `In-game SkyPvP balance and economy standing on PikaNetwork.`
      );
      embed.setColor(COLORS.SUCCESS);
      embed.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/100`);

      const rankStr = rank ? `#${formatNumber(rank)}` : 'Unranked';
      let percentileStr = '';
      if (rank && totalPlayers > 0) {
        const topPct = ((rank / totalPlayers) * 100).toFixed(1);
        percentileStr = ` *(Top ${topPct}%)*`;
      }

      embed.addFields([
        {
          name: '💵 Current Balance',
          value: `**$${formatNumber(balNum)}**`,
          inline: true,
        },
        {
          name: '🏆 Baltop Ranking',
          value: `\`${rankStr}\`${percentileStr}`,
          inline: true,
        },
      ]);

      if (totalPlayers > 0) {
        embed.addFields({
          name: '👥 Economy Size',
          value: `\`${formatNumber(totalPlayers)}\` tracked players`,
          inline: true,
        });
      }

      // Additional economy telemetry if available
      const bountyMoney = stats?.['Bounty claimed']?.entries?.[0]?.value || stats?.['bounty.money.claimed']?.entries?.[0]?.value;
      const ahSold = stats?.['Auction House Items Sold']?.entries?.[0]?.value || stats?.['ah.itemssold']?.entries?.[0]?.value;

      if (bountyMoney || ahSold) {
        const extraLines: string[] = [];
        if (bountyMoney) extraLines.push(`• **Bounties Claimed**: \`$${formatNumber(bountyMoney)}\``);
        if (ahSold) extraLines.push(`• **Auction Items Sold**: \`${formatNumber(ahSold)}\``);

        embed.addFields({
          name: '📊 Economy Telemetry',
          value: extraLines.join('\n'),
          inline: false,
        });
      }

      embed.setFooter({
        text: 'SkyPvP Economy • Use /baltop to view the richest players leaderboard',
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Balance Lookup Failed', err?.message || 'Failed to retrieve balance data.')],
      });
    }
  },
};
