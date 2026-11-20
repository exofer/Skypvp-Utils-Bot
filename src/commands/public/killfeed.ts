import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getFights } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatWeaponName } from '../../utils/minecraft.js';

export const killfeedCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('killfeed')
    .setDescription('View live network-wide SkyPvP kill activity')
    .addIntegerOption((opt) =>
      opt
        .setName('limit')
        .setDescription('Number of recent kills to display (default: 8, max: 20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    try {
      const limit = interaction.options.getInteger('limit') ?? 8;
      const fights = await getFights(limit);

      const embed = infoEmbed(
        '⚔️ Live SkyPvP Killfeed',
        'Recent combat deaths and PvP takedowns across PikaNetwork SkyPvP.'
      );

      if (!fights || fights.length === 0) {
        embed.setDescription('No recent SkyPvP kills found.');
      } else {
        const lines = fights.slice(0, limit).map((f: any) => {
          const killer = f.winner?.username || f.killer?.username || 'Unknown';
          const victim = f.loser?.username || f.victim?.username || 'Unknown';

          let weaponText = '';
          if (f.cause === 'VOID') {
            weaponText = ' into the void';
          } else {
            const wName = formatWeaponName(f.weapon, f.winner?.weapon || f.killer?.weapon);
            if (wName) {
              weaponText = ` with *${wName}*`;
            }
          }

          const action = f.cause === 'VOID' ? 'knocked' : 'killed';
          const time = f.time ? `<t:${Math.floor(f.time / 1000)}:R>` : '';
          return `• **${killer}** ${action} **${victim}**${weaponText} ${time}`;
        });

        embed.addFields({ name: `Latest ${lines.length} Kills`, value: lines.join('\n') });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Killfeed Error', err.message || 'Failed to fetch killfeed.')],
      });
    }
  },
};
