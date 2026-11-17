import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getFights } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { stripColorCodes } from '../../utils/minecraft.js';

export const killfeedCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('killfeed')
    .setDescription('View live network-wide SkyPvP kill activity'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    try {
      const fights = await getFights(8);

      const embed = infoEmbed(
        '⚔️ Live SkyPvP Killfeed',
        'Recent combat deaths and PvP takedowns across PikaNetwork SkyPvP.'
      );

      if (!fights || fights.length === 0) {
        embed.setDescription('No recent SkyPvP kills found.');
      } else {
        const lines = fights.map((f) => {
          const killer = f.killer?.username || 'Unknown';
          const victim = f.victim?.username || 'Unknown';
          const weapon = f.killer?.weapon ? ` with *${stripColorCodes(f.killer.weapon)}*` : '';
          const time = f.time ? `<t:${Math.floor(f.time / 1000)}:R>` : '';
          return `• **${killer}** killed **${victim}**${weapon} ${time}`;
        });

        embed.addFields({ name: 'Latest Kills', value: lines.join('\n') });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Killfeed Error', err.message || 'Failed to fetch killfeed.')],
      });
    }
  },
};
