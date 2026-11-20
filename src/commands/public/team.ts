import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { teamService } from '../../services/team.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const teamCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('SkyPvP teams leaderboard and team statistics')
    .addSubcommand((sub) =>
      sub
        .setName('tops')
        .setDescription('View the SkyPvP teams leaderboard')
        .addIntegerOption((opt) =>
          opt
            .setName('page')
            .setDescription('Page number (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('top')
        .setDescription('Alias for /team tops (view teams leaderboard)')
        .addIntegerOption((opt) =>
          opt
            .setName('page')
            .setDescription('Page number (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View detailed information, roster, and stats for a SkyPvP team')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Team name or team member username')
            .setRequired(true)
        )
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'tops' || sub === 'top') {
      const page = interaction.options.getInteger('page') || 1;
      await interaction.deferReply();

      try {
        const { entries, page: curPage, totalPages } = await teamService.getLeaderboard(page, 10);

        const embed = infoEmbed(
          '🏆 SkyPvP Teams Leaderboard',
          `Top ranked teams on PikaNetwork SkyPvP • Page **${curPage}** of **${totalPages}**`
        );

        if (entries.length === 0) {
          embed.setDescription('No team rankings found on this page.');
        } else {
          const lines = entries.map((t, idx) => {
            const rank = t.place || (curPage - 1) * 10 + idx + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`#${rank}\``;
            const points = formatNumber(t.value);
            return `${medal} **${t.displayName}** — \`${points}\` pts`;
          });

          embed.addFields({ name: 'Rankings', value: lines.join('\n') });
        }

        embed.setFooter({
          text: `Page ${curPage}/${totalPages} • Use /team info <name> for detailed team roster & stats`,
        });

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Leaderboard Error', err?.message || 'Failed to retrieve team leaderboard.')],
        });
      }
    } else if (sub === 'info') {
      const query = interaction.options.getString('name', true);
      await interaction.deferReply();

      try {
        const details = await teamService.findTeam(query);

        if (!details || !details.team) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Team Not Found',
                `Could not find a SkyPvP team matching **"${query}"** on PikaNetwork.\n\n` +
                  '• Verify the team name spelling\n' +
                  '• Or enter the exact Minecraft username of any current team member'
              ),
            ],
          });
          return;
        }

        const team = details.team;
        const tagStr = team.tag ? ` [${team.tag}]` : '';
        const rankStr = details.place ? `#${details.place}` : 'Unranked';
        const seasonStr = team.season ? `Season ${team.season}` : 'SkyPvP';
        const points = team.headlineValue ?? parseFloat(team.headline || '0') ?? 0;

        const members = team.members || details.members || [];
        const agg = team.aggStats || details.aggStats || {};

        const embed = infoEmbed(
          `🛡️ Team: ${team.displayName}${tagStr}`,
          `**Rank**: \`${rankStr}\` (${seasonStr}) • **Points**: \`${formatNumber(points)}\` pts`
        );

        // 1. Roster breakdown
        const roster = teamService.formatRoster(members);
        const rosterLines: string[] = [];
        if (roster.leaders.length > 0) {
          rosterLines.push(`👑 **Leader**: ${roster.leaders.map((u) => `\`${u}\``).join(', ')}`);
        }
        if (roster.coLeaders.length > 0) {
          rosterLines.push(`⭐ **Co-Leaders**: ${roster.coLeaders.map((u) => `\`${u}\``).join(', ')}`);
        }
        if (roster.officers.length > 0) {
          rosterLines.push(`🛡️ **Officers**: ${roster.officers.map((u) => `\`${u}\``).join(', ')}`);
        }
        if (roster.recruits.length > 0) {
          const displayed = roster.recruits.slice(0, 8).map((u) => `\`${u}\``).join(', ');
          const extra = roster.recruits.length > 8 ? ` *(+${roster.recruits.length - 8} more)*` : '';
          rosterLines.push(`⚔️ **Members (${roster.recruits.length})**: ${displayed}${extra}`);
        }

        embed.addFields({
          name: `👥 Roster (${team.memberCount || members.length || 0} Members)`,
          value: rosterLines.length > 0 ? rosterLines.join('\n') : '*No members listed*',
          inline: false,
        });

        // 2. Combat & PvP statistics
        const kills = agg['common.kills'] || agg['kills'] || 0;
        const deaths = agg['common.deaths'] || agg['deaths'] || 0;
        const kdr = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
        const streak = agg['common.highestkillstreak'] || agg['highestkillstreak'] || 0;

        embed.addFields({
          name: '⚔️ Combat & PvP',
          value:
            `• **Kills**: \`${formatNumber(kills)}\`\n` +
            `• **Deaths**: \`${formatNumber(deaths)}\`\n` +
            `• **K/D Ratio**: \`${kdr}\`\n` +
            `• **Best Streak**: \`${formatNumber(streak)}\``,
          inline: true,
        });

        // 3. Events & Outposts
        const outposts = agg['outpost.captured'] || agg['outpost.captures'] || 0;
        const kothWins = agg['koth.wins'] || agg['koth.won.total'] || 0;
        const eventsWon = agg['events.won'] || 0;
        const chestsOpened = agg['events.drops.chests.opened'] || agg['chests.opened'] || 0;

        embed.addFields({
          name: '🏆 Events & Outposts',
          value:
            `• **Outposts Captured**: \`${formatNumber(outposts)}\`\n` +
            `• **KoTH Wins**: \`${formatNumber(kothWins)}\`\n` +
            `• **Events Won**: \`${formatNumber(eventsWon)}\`\n` +
            `• **Supply Drops**: \`${formatNumber(chestsOpened)}\``,
          inline: true,
        });

        // 4. Economy & Activity
        const balance = agg['common.balance'] || agg['balance'] || 0;
        const playtime = teamService.formatDuration(agg['onlinetime.played'] || 0);
        const crates = (agg['luckycrates.opened.total'] || 0) + (agg['crate.open.total'] || 0);

        embed.addFields({
          name: '💰 Treasury & Activity',
          value:
            `• **Treasury**: \`$${formatNumber(balance)}\`\n` +
            `• **Total Playtime**: \`${playtime}\`\n` +
            `• **Crates Opened**: \`${formatNumber(crates)}\``,
          inline: true,
        });

        embed.setFooter({
          text: `SkyPvP Team Statistics • PikaNetwork`,
        });

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Team Search Error', err?.message || 'Failed to retrieve team details.')],
        });
      }
    }
  },
};
