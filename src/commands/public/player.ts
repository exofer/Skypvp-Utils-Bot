import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getProfile, getPlayerStats } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber, stripColorCodes } from '../../utils/minecraft.js';

export const playerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('View a comprehensive player profile and SkyPvP overview')
    .addStringOption((opt) =>
      opt.setName('username').setDescription('The Minecraft username').setRequired(true)
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
      const embed = infoEmbed(
        `Player Overview: ${displayName}`,
        `Comprehensive profile & SkyPvP combat summary on PikaNetwork.`
      );

      embed.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/100`);

      // 1. Network Profile Information
      if (profile) {
        let rankStr = 'Member';
        if (profile.ranks && profile.ranks.length > 0) {
          rankStr = profile.ranks.map((r: any) => stripColorCodes(r.displayName || r.name)).join(', ');
        } else if (profile.rank?.level) {
          rankStr = `Level ${profile.rank.level}`;
        }

        embed.addFields([
          { name: '🎖️ Rank', value: `\`${rankStr}\``, inline: true },
          { name: '⭐ Level', value: `${profile.rank?.level ?? 1}`, inline: true },
          { name: '✨ Exp', value: profile.rank?.experience ? formatNumber(profile.rank.experience) : '0', inline: true },
        ]);
      }

      // 2. SkyPvP Stats Information
      if (stats) {
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
        const balance = getStat('Balance');
        const rating = getStat('Rank Rating');

        embed.addFields([
          { name: '⚔️ Kills', value: `${kills.val} (${kills.place})`, inline: true },
          { name: '☠️ Deaths', value: `${deaths.val} (${deaths.place})`, inline: true },
          { name: '📊 K/D Ratio', value: `\`${kdr}\``, inline: true },
          { name: '🔥 Best Streak', value: `${streak.val} (${streak.place})`, inline: true },
          { name: '💰 Balance', value: `$${balance.val}`, inline: true },
          { name: '🏆 Rating', value: `${rating.val} (${rating.place})`, inline: true },
        ]);
      }

      const clan = (profile as any)?.clan;
      if (clan) {
        embed.addFields({
          name: '🛡️ Clan',
          value: `[${clan.tag || clan.name}] ${clan.name}`,
          inline: true,
        });
      }

      if (profile?.lastSeen) {
        embed.addFields({
          name: '🕒 Last Seen',
          value: `<t:${Math.floor(new Date(profile.lastSeen).getTime() / 1000)}:R>`,
          inline: true,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Failed to Fetch Player', err?.message || 'Could not retrieve player statistics.')],
      });
    }
  },
};
