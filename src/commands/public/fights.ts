import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getPlayerFights } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { stripColorCodes } from '../../utils/minecraft.js';

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
      const data = await getPlayerFights(username, 5);
      const fights = Array.isArray(data?.fights) ? data.fights : [];

      const embed = infoEmbed(
        `Recent Fights: ${username}`,
        `Latest recorded SkyPvP encounters for **${username}**.`
      );

      if (fights.length === 0) {
        embed.setDescription(`No recent SkyPvP fights recorded for **${username}**.`);
      } else {
        for (const fight of fights.slice(0, 5)) {
          const isKiller = fight.killer?.username?.toLowerCase() === username.toLowerCase();
          const opponent = isKiller ? fight.victim?.username : fight.killer?.username;
          const outcome = isKiller ? '🟢 VICTORY' : '🔴 DEFEAT';
          const weapon = fight.killer?.weapon ? ` (${stripColorCodes(fight.killer.weapon)})` : '';
          const time = fight.time ? `<t:${Math.floor(fight.time / 1000)}:R>` : 'Recently';

          embed.addFields({
            name: `${outcome} vs ${opponent || 'Unknown'}`,
            value: `**Weapon**: ${weapon || 'None'}\n**Time**: ${time}`,
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
