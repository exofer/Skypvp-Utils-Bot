import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { systemService, PUBLIC_COMMAND_NAMES } from '../../services/system.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';

export const COMMAND_CHOICES = [
  { name: 'All Public Commands', value: 'all' },
  { name: '/auction — SkyPvP Auction House', value: 'auction' },
  { name: '/bal — Player In-Game Balance', value: 'bal' },
  { name: '/baltop — Top Player Balances', value: 'baltop' },
  { name: '/baltops — Top Player Balances (Alias)', value: 'baltops' },
  { name: '/chat — Minecraft In-Game Chat Bridge', value: 'chat' },
  { name: '/chatstatus — Chat Bridge Status', value: 'chatstatus' },
  { name: '/compare — Compare Two Players', value: 'compare' },
  { name: '/events — SkyPvP Events & Warzone Info', value: 'events' },
  { name: '/fights — Recent SkyPvP Fights', value: 'fights' },
  { name: '/help — Bot Commands & Documentation', value: 'help' },
  { name: '/killfeed — Live Killfeed & Top Streaks', value: 'killfeed' },
  { name: '/leaderboard — SkyPvP Leaderboards', value: 'leaderboard' },
  { name: '/ping — Bot Latency & WebSocket Ping', value: 'ping' },
  { name: '/player — Player Overview & Profile', value: 'player' },
  { name: '/profile — Player Profile & History', value: 'profile' },
  { name: '/stats — Detailed Player SkyPvP Stats', value: 'stats' },
  { name: '/team — SkyPvP Team Info & Tops', value: 'team' },
  { name: '/track — Player Stat Tracking', value: 'track' },
];

export const SCOPE_CHOICES = [
  { name: 'Global (All Servers & DMs)', value: 'global' },
  { name: 'This Server Only', value: 'server' },
];

export function buildCommandAvailabilityEmbed(
  guildId = 'global',
  guildName?: string
) {
  const isGlobal = guildId === 'global';
  const scopeLabel = isGlobal ? 'Global' : (guildName || `Server (${guildId})`);
  const availability = systemService.getCommandAvailability(guildId);

  const getStatus = (name: string): string => {
    const item = availability.find((a) => a.command === name);
    return item?.available ? '🟢 Available' : '🔴 Disabled';
  };

  const embed = infoEmbed(
    `🛡️ Public Command Availability: ${scopeLabel}`,
    `Configure whether regular Discord members can run each public command.\n` +
      `*(Bot owners and server administrators can always execute all commands).*`
  );
  embed.setColor(COLORS.INFO);

  const economy = ['auction', 'bal', 'baltop', 'baltops']
    .map((c) => `• \`/${c}\`: ${getStatus(c)}`)
    .join('\n');

  const statsLeaderboards = ['player', 'profile', 'stats', 'compare', 'leaderboard', 'team']
    .map((c) => `• \`/${c}\`: ${getStatus(c)}`)
    .join('\n');

  const combatEvents = ['fights', 'killfeed', 'events', 'chat', 'chatstatus']
    .map((c) => `• \`/${c}\`: ${getStatus(c)}`)
    .join('\n');

  const utility = ['help', 'ping', 'track']
    .map((c) => `• \`/${c}\`: ${getStatus(c)}`)
    .join('\n');

  embed.addFields([
    { name: '💵 Economy & Trading', value: economy, inline: true },
    { name: '📊 Stats & Leaderboards', value: statsLeaderboards, inline: true },
    { name: '⚔️ Combat & In-Game Events', value: combatEvents, inline: true },
    { name: '⚙️ Utilities', value: utility, inline: true },
  ]);

  const activeCount = availability.filter((a) => a.available).length;
  const totalCount = availability.length;
  embed.setFooter({
    text: `SkyPvP Utils • ${activeCount}/${totalCount} Public Commands Enabled (${scopeLabel})`,
  });

  return embed;
}

export const commandsOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownercommands')
    .setDescription('Configure public command availability (Owner only)')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View the availability status of all public commands')
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Configuration scope')
            .setRequired(false)
            .addChoices(...SCOPE_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Enable a public command for regular users')
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('The command to enable')
            .setRequired(true)
            .addChoices(...COMMAND_CHOICES)
        )
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Configuration scope')
            .setRequired(false)
            .addChoices(...SCOPE_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Disable a public command for regular users')
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('The command to disable')
            .setRequired(true)
            .addChoices(...COMMAND_CHOICES)
        )
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Configuration scope')
            .setRequired(false)
            .addChoices(...SCOPE_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set availability for a specific public command')
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('The command to configure')
            .setRequired(true)
            .addChoices(...COMMAND_CHOICES)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('available')
            .setDescription('Set command availability (true = enabled, false = disabled)')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Configuration scope')
            .setRequired(false)
            .addChoices(...SCOPE_CHOICES)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();
    const scopeOption = interaction.options.getString('scope') || 'global';
    const targetGuildId = scopeOption === 'server' && interaction.guildId ? interaction.guildId : 'global';
    const scopeLabel = targetGuildId === 'global' ? 'globally' : 'for this server';

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'list') {
      const embed = buildCommandAvailabilityEmbed(targetGuildId, interaction.guild?.name);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const commandArg = interaction.options.getString('command', true);
    let available = true;

    if (sub === 'enable') {
      available = true;
    } else if (sub === 'disable') {
      available = false;
    } else if (sub === 'set') {
      available = interaction.options.getBoolean('available', true);
    }

    if (commandArg === 'all') {
      await systemService.setAllCommandsAvailability(available, targetGuildId);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `All **${PUBLIC_COMMAND_NAMES.length}** public commands are now **${available ? 'ENABLED' : 'DISABLED'}** ${scopeLabel}.\n` +
              `*(Owner and server administrators bypass this restriction).*`
          ),
        ],
      });
      return;
    }

    // Single command
    await systemService.setCommandAvailability(commandArg, available, targetGuildId);
    await interaction.editReply({
      embeds: [
        successEmbed(
          'Command Availability Updated',
          `The public command \`/${commandArg}\` is now **${available ? 'ENABLED' : 'DISABLED'}** ${scopeLabel}.\n` +
            `*(Owner and server administrators bypass this restriction).*`
        ),
      ],
    });
  },
};
