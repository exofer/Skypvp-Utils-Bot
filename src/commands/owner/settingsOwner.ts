import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { systemService } from '../../services/system.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { COMMAND_CHOICES, buildCommandAvailabilityEmbed } from './commandsOwner.js';
import { POLLING_INTERVALS } from '../../config/constants.js';

export const settingsOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownersettings')
    .setDescription('Configure overall bot settings, maintenance mode, and command availability')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View comprehensive bot configuration and active settings')
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Modify a core bot setting')
        .addStringOption((opt) =>
          opt
            .setName('setting')
            .setDescription('Setting to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Maintenance Mode', value: 'maintenance' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setDescription('Value for the setting (e.g. true, false, on, off)')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset settings to system defaults')
        .addStringOption((opt) =>
          opt
            .setName('target')
            .setDescription('What to reset')
            .setRequired(true)
            .addChoices(
              { name: 'Public Commands Availability (Enable All)', value: 'public-commands' },
              { name: 'Maintenance Mode (Disable)', value: 'maintenance' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('public-commands')
        .setDescription('Configure availability of public commands')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(false)
            .addChoices(
              { name: 'List All Commands Status', value: 'list' },
              { name: 'Enable Command', value: 'enable' },
              { name: 'Disable Command', value: 'disable' },
              { name: 'Enable All Commands', value: 'enable-all' },
              { name: 'Disable All Commands', value: 'disable-all' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('Specific command to configure')
            .setRequired(false)
            .addChoices(...COMMAND_CHOICES)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Toggle all public commands')
            .setRequired(false)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId || 'global';
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const isMaint = systemService.isMaintenance();
      const allOwners = systemService.getAllOwners();
      const blacklisted = systemService.getBlacklisted();
      const commandAvailability = systemService.getCommandAvailability(guildId);
      const disabledCount = commandAvailability.filter((c) => !c.available).length;

      const embed = infoEmbed(
        '⚙️ SkyPvP Utils — System Settings Overview',
        'Current operational parameters and owner configuration:'
      );

      embed.addFields([
        {
          name: '🛡️ Core Operational State',
          value:
            `• **Maintenance Mode**: ${isMaint ? '🔴 ACTIVE (Only owners can use commands)' : '🟢 Normal (Open)'}\n` +
            `• **Configured Owners**: ${allOwners.map((id) => `<@${id}>`).join(', ')}\n` +
            `• **Blacklisted Users**: ${blacklisted.length} users restricted`,
          inline: false,
        },
        {
          name: '📋 Public Command Availability',
          value:
            `• **Disabled Commands (${disabledCount})**: ${
              disabledCount > 0
                ? commandAvailability
                    .filter((c) => !c.available)
                    .map((c) => `\`/${c.command}\``)
                    .join(', ')
                : '`None (All Enabled)`'
            }\n` +
            `• Use \`/ownercommands\` or \`/ownersettings public-commands\` to toggle individual commands.`,
          inline: false,
        },
        {
          name: '⏱️ Background Polling Intervals',
          value:
            `• **Player Stats**: ${POLLING_INTERVALS.PLAYER_STATS / 1000}s\n` +
            `• **Auction Polling**: ${POLLING_INTERVALS.AUCTION / 1000}s\n` +
            `• **Event Monitor**: ${POLLING_INTERVALS.EVENTS / 1000}s\n` +
            `• **KOTH Monitor**: ${POLLING_INTERVALS.KOTH / 1000}s\n` +
            `• **Outpost Monitor**: ${POLLING_INTERVALS.OUTPOST / 1000}s`,
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'set') {
      const setting = interaction.options.getString('setting', true);
      const val = interaction.options.getString('value', true).toLowerCase();

      if (setting === 'maintenance') {
        const isTrue = val === 'true' || val === 'on' || val === '1' || val === 'enable';
        await systemService.setMaintenance(isTrue);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Maintenance Mode Updated',
              `Maintenance mode is now **${isTrue ? 'ACTIVE' : 'DISABLED'}**.`
            ),
          ],
        });
        return;
      }
    }

    if (sub === 'reset') {
      const target = interaction.options.getString('target', true);

      if (target === 'public-commands') {
        await systemService.setAllCommandsAvailability(true, guildId);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Settings Reset',
              `All public commands have been reset to **ENABLED**.`
            ),
          ],
        });
        return;
      } else if (target === 'maintenance') {
        await systemService.setMaintenance(false);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Settings Reset',
              `Maintenance mode has been reset to **DISABLED**.`
            ),
          ],
        });
        return;
      }
    }

    // --- Subcommand: public-commands ---
    const action = interaction.options.getString('action');
    const commandArg = interaction.options.getString('command');
    const enabledOption = interaction.options.getBoolean('enabled');

    if (action === 'list' || (!action && !commandArg && enabledOption === null)) {
      const embed = buildCommandAvailabilityEmbed(guildId, interaction.guild?.name);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (action === 'enable' && commandArg) {
      if (commandArg === 'all') {
        await systemService.setAllCommandsAvailability(true, guildId);
      } else {
        await systemService.setCommandAvailability(commandArg, true, guildId);
      }
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `Command \`/${commandArg}\` is now **ENABLED** for public users.`
          ),
        ],
      });
      return;
    }

    if (action === 'disable' && commandArg) {
      if (commandArg === 'all') {
        await systemService.setAllCommandsAvailability(false, guildId);
      } else {
        await systemService.setCommandAvailability(commandArg, false, guildId);
      }
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `Command \`/${commandArg}\` is now **DISABLED** for public users.`
          ),
        ],
      });
      return;
    }

    if (action === 'enable-all') {
      await systemService.setAllCommandsAvailability(true, guildId);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `All public commands are now **ENABLED** for this server.`
          ),
        ],
      });
      return;
    }

    if (action === 'disable-all') {
      await systemService.setAllCommandsAvailability(false, guildId);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `All public commands are now **DISABLED** for this server.`
          ),
        ],
      });
      return;
    }

    if (enabledOption !== null) {
      await systemService.setAllCommandsAvailability(enabledOption, guildId);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Updated',
            `All public commands are now **${enabledOption ? 'ENABLED' : 'DISABLED'}** for this server.`
          ),
        ],
      });
      return;
    }

    const embed = buildCommandAvailabilityEmbed(guildId, interaction.guild?.name);
    await interaction.editReply({ embeds: [embed] });
  },
};
