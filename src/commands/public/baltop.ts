import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { getLeaderboard } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';
import { COLORS } from '../../config/constants.js';

async function handleBaltopExecution(interaction: ChatInputCommandInteraction) {
  const page = Math.max(1, Math.min(interaction.options.getInteger('page') || 1, 10));
  const offset = (page - 1) * 10;
  await interaction.deferReply();

  try {
    const data = await getLeaderboard('common.balance', 'total', offset, 10);
    const entries = data.entries || [];

    const embed = infoEmbed(
      '💰 SkyPvP Baltop — Richest Players',
      `Leaderboard of the wealthiest players on PikaNetwork SkyPvP • Page **${page}** of **10**`
    );
    embed.setColor(COLORS.SUCCESS);

    if (entries.length === 0) {
      embed.setDescription('No balance entries found for this page.');
    } else {
      const lines = entries.map((e, idx) => {
        const rank = e.place || offset + idx + 1;
        const name = e.user?.username || e.id || 'Unknown';
        const val = `$${formatNumber(e.value)}`;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;
        return `${medal} **${name}** — \`${val}\``;
      });

      embed.addFields({ name: 'Rankings', value: lines.join('\n') });
    }

    embed.setFooter({
      text: `Page ${page}/10 • Use /bal <username> to check any player's in-game balance`,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.editReply({
      embeds: [errorEmbed('Baltop Failed', err?.message || 'Failed to retrieve balance leaderboard.')],
    });
  }
}

export const baltopCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('baltop')
    .setDescription('View the richest players leaderboard on PikaNetwork SkyPvP')
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number (1-10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: handleBaltopExecution,
};

export const baltopsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('baltops')
    .setDescription('View the richest players leaderboard on PikaNetwork SkyPvP (alias for /baltop)')
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number (1-10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),
  permission: PermissionLevel.PUBLIC,
  execute: handleBaltopExecution,
};
