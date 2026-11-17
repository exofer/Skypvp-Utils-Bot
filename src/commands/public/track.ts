import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { playerService } from '../../services/player.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const trackCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('Manage your tracked SkyPvP players and stat history')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Track a player for periodic stat updates')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('The Minecraft username').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Stop tracking a player')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('The Minecraft username').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List your tracked players')
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View stat progression and deltas for a tracked player')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('The Minecraft username').setRequired(true)
        )
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (subcommand === 'add') {
      const username = interaction.options.getString('username', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        await playerService.trackPlayer(userId, username);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Player Tracked',
              `Now tracking **${username}**. Stat snapshots will be recorded periodically.`
            ),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Tracking Failed', err.message || 'Could not track player.')],
        });
      }
    } else if (subcommand === 'remove') {
      const username = interaction.options.getString('username', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        await playerService.untrackPlayer(userId, username);
        await interaction.editReply({
          embeds: [
            successEmbed('Player Untracked', `Stopped tracking **${username}**.`),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Untrack Failed', err.message || 'Could not untrack player.')],
        });
      }
    } else if (subcommand === 'list') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const tracked = await playerService.getTrackedPlayers(userId);

        const embed = infoEmbed(
          'Tracked Players',
          `You are tracking **${tracked.length}/10** players:`
        );

        if (tracked.length === 0) {
          embed.setDescription('You are not tracking any players yet. Use `/track add <username>`.');
        } else {
          const list = tracked
            .map((t) => {
              const lastSnap = t.snapshots[0];
              const time = lastSnap?.snapshotAt ? `<t:${Math.floor(lastSnap.snapshotAt.getTime() / 1000)}:R>` : 'Pending';
              return `• **${t.playerName}** (Last updated: ${time})`;
            })
            .join('\n');
          embed.addFields({ name: 'Players', value: list });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', err.message || 'Failed to list tracked players.')],
        });
      }
    } else if (subcommand === 'info') {
      const username = interaction.options.getString('username', true);
      await interaction.deferReply();

      try {
        const trackedList = await playerService.getTrackedPlayers(userId);
        const player = trackedList.find((p) => p.playerName.toLowerCase() === username.toLowerCase());

        if (!player) {
          await interaction.editReply({
            embeds: [errorEmbed('Not Tracked', `You are not tracking **${username}**. Add them with \`/track add\`.`)],
          });
          return;
        }

        const deltas = await playerService.getPlayerDeltas(player.id);
        const latest = player.snapshots[0];

        const embed = infoEmbed(
          `Tracking Info: ${player.playerName}`,
          `Historical snapshots and recent stat progression.`
        );

        if (latest) {
          embed.addFields([
            { name: '⚔️ Kills', value: `${formatNumber(latest.kills)}`, inline: true },
            { name: '☠️ Deaths', value: `${formatNumber(latest.deaths)}`, inline: true },
            { name: '🏆 Wins', value: `${formatNumber(latest.wins)}`, inline: true },
          ]);
        }

        if (deltas.length === 0) {
          embed.addFields({
            name: '📈 Recent Stat Changes',
            value: 'No stat differences detected since the previous snapshot.',
            inline: false,
          });
        } else {
          const deltaLines = deltas
            .map((d) => {
              const sign = d.diff > 0 ? `+${formatNumber(d.diff)}` : `${formatNumber(d.diff)}`;
              return `• **${d.stat}**: ${formatNumber(d.previous)} ➔ ${formatNumber(d.current)} (\`${sign}\`)`;
            })
            .join('\n');
          embed.addFields({
            name: '📈 Recent Stat Changes',
            value: deltaLines,
            inline: false,
          });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', err.message || 'Failed to get tracking info.')],
        });
      }
    }
  },
};
