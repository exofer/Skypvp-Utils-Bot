import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getPlayerFights } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatWeaponName, formatNumber } from '../../utils/minecraft.js';

export const fightsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('fights')
    .setDescription('View recent SkyPvP fight history for a player')
    .addStringOption((opt) =>
      opt.setName('username').setDescription('The Minecraft username').setRequired(true)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();

    try {
      const data = await getPlayerFights(username, 10);

      // Support both data.recent (current Pika API format) and data.fights
      let fightEntries: any[] = [];
      if (Array.isArray(data?.recent)) {
        fightEntries = data.recent.map((r: any) => ({
          fight: r.fight || r,
          won: r.won ?? ((r.fight?.winner?.username || r.winner?.username)?.toLowerCase() === username.toLowerCase()),
        }));
      } else if (Array.isArray(data?.fights)) {
        fightEntries = data.fights.map((f: any) => ({
          fight: f,
          won: (f.winner?.username || f.killer?.username)?.toLowerCase() === username.toLowerCase(),
        }));
      } else if (Array.isArray(data)) {
        fightEntries = data.map((f: any) => ({
          fight: f.fight || f,
          won: f.won ?? ((f.winner?.username || f.killer?.username)?.toLowerCase() === username.toLowerCase()),
        }));
      }

      const embed = infoEmbed(
        `Recent Fights: ${username}`,
        `Latest recorded SkyPvP encounters for **${username}**.`
      );

      // Add combat stats summary if available
      if (data && typeof data === 'object' && ('kills' in data || 'streak' in data)) {
        const kills = formatNumber(data.kills ?? 0);
        const deaths = formatNumber(data.deaths ?? 0);
        const streak = formatNumber(data.streak ?? 0);
        const bestStreak = formatNumber(data.bestStreak ?? 0);
        embed.addFields({
          name: 'Combat Summary (Last 30 Days)',
          value: `⚔️ **Kills**: ${kills} | ☠️ **Deaths**: ${deaths} | 🔥 **Streak**: ${streak} (Best: ${bestStreak})`,
          inline: false,
        });
      }

      if (fightEntries.length === 0) {
        embed.setDescription(`No recent SkyPvP fights recorded for **${username}**.`);
      } else {
        for (const entry of fightEntries.slice(0, 5)) {
          const f = entry.fight;
          const winnerName = f.winner?.username || f.killer?.username;
          const loserName = f.loser?.username || f.victim?.username;
          const isWinner = entry.won ?? (winnerName?.toLowerCase() === username.toLowerCase());

          const opponent = isWinner ? (loserName || 'Unknown') : (winnerName || 'Unknown');
          const outcome = isWinner ? '🟢 VICTORY' : '🔴 DEFEAT';

          let weaponText = '';
          if (f.cause === 'VOID') {
            weaponText = 'Void';
          } else {
            const wName = formatWeaponName(
              f.weapon,
              isWinner ? (f.winner?.weapon || f.killer?.weapon) : (f.loser?.weapon || f.victim?.weapon)
            );
            weaponText = wName || 'None';
          }

          const time = f.time ? `<t:${Math.floor(f.time / 1000)}:R>` : 'Recently';

          embed.addFields({
            name: `${outcome} vs ${opponent}`,
            value: `**Cause / Weapon**: ${weaponText}\n**Time**: ${time}`,
            inline: false,
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Error', err.message || 'Failed to fetch player fights.')],
      });
    }
  },
};
