import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { systemService } from '../../services/system.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';

export const ownersOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerowners')
    .setDescription('Manage multiple bot owners (Owner only)')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all configured and dynamic bot owners')
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user as a bot co-owner')
        .addUserOption((opt) =>
          opt.setName('target').setDescription('Discord user to grant owner permissions').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from bot co-owners')
        .addUserOption((opt) =>
          opt.setName('target').setDescription('Discord user to revoke owner permissions from').setRequired(true)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'list') {
      const configured = systemService.getConfiguredOwners();
      const dynamic = systemService.getDynamicOwners();
      const all = systemService.getAllOwners();

      const embed = infoEmbed(
        '👑 Bot Owners & Administrative Access',
        `Viewing all Discord users with full Bot Owner privileges.`
      );
      embed.setColor(COLORS.INFO);

      const configStr =
        configured.length > 0
          ? configured.map((id) => `• <@${id}> (\`${id}\`)`).join('\n')
          : '*None configured*';

      const dynamicStr =
        dynamic.length > 0
          ? dynamic.map((id) => `• <@${id}> (\`${id}\`)`).join('\n')
          : '*No additional co-owners added*';

      embed.addFields([
        { name: '🔒 Primary Owners (Configured in .env)', value: configStr, inline: false },
        { name: '⭐ Co-Owners (Dynamically Added)', value: dynamicStr, inline: false },
      ]);

      embed.setFooter({ text: `Total Owners: ${all.length} user(s)` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const targetUser = interaction.options.getUser('target', true);

    if (sub === 'add') {
      if (systemService.isOwner(targetUser.id)) {
        await interaction.editReply({
          embeds: [infoEmbed('Already Owner', `<@${targetUser.id}> is already a bot owner.`)],
        });
        return;
      }

      await systemService.addOwner(targetUser.id);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Bot Owner Added',
            `Successfully granted full Bot Owner permissions to <@${targetUser.id}> (\`${targetUser.id}\`).\n` +
              `*(They now have access to all owner commands, maintenance mode, and bot controls).*`
          ),
        ],
      });
      return;
    }

    if (sub === 'remove') {
      if (systemService.getConfiguredOwners().includes(targetUser.id)) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Cannot Remove Primary Owner',
              `<@${targetUser.id}> is configured as a primary owner in the bot environment (.env) and cannot be removed dynamically.`
            ),
          ],
        });
        return;
      }

      if (!systemService.isOwner(targetUser.id)) {
        await interaction.editReply({
          embeds: [errorEmbed('Not An Owner', `<@${targetUser.id}> is not currently a bot owner.`)],
        });
        return;
      }

      await systemService.removeOwner(targetUser.id);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Bot Owner Removed',
            `Successfully revoked Bot Owner permissions from <@${targetUser.id}> (\`${targetUser.id}\`).`
          ),
        ],
      });
      return;
    }
  },
};
