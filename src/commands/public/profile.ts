import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getProfile } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber, stripColorCodes } from '../../utils/minecraft.js';

export const profileCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player profile on PikaNetwork')
    .addStringOption((opt) =>
      opt.setName('username').setDescription('The Minecraft username').setRequired(true)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();

    try {
      const profile = await getProfile(username);

      const embed = infoEmbed(
        `Player Profile: ${profile.username}`,
        `Network details for **${profile.username}** on PikaNetwork.`
      );

      embed.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}/100`);

      embed.addFields([
        {
          name: '⭐ Level',
          value: profile.rank?.level ? `${profile.rank.level}` : 'Unranked',
          inline: true,
        },
        {
          name: '✨ Experience',
          value: profile.rank?.experience ? formatNumber(profile.rank.experience) : '0',
          inline: true,
        },
        {
          name: '👥 Friends',
          value: `${profile.friends?.length ?? 0}`,
          inline: true,
        },
      ]);

      if (profile.lastSeen) {
        embed.addFields({
          name: '🕒 Last Seen',
          value: `<t:${Math.floor(profile.lastSeen / 1000)}:R>`,
          inline: true,
        });
      }

      if (profile.ranks && profile.ranks.length > 0) {
        const ranksList = profile.ranks
          .map((r) => `• **${r.server ?? 'Network'}**: ${stripColorCodes(r.displayName ?? r.name)}`)
          .join('\n');
        embed.addFields({ name: '🎖️ Server Ranks', value: ranksList || 'None', inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      if (err.statusCode === 404) {
        await interaction.editReply({
          embeds: [errorEmbed('Player Not Found', `No player with username \`${username}\` was found.`)],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', err.message || 'Failed to fetch player profile.')],
        });
      }
    }
  },
};
