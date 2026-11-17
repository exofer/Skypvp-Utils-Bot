import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { successEmbed } from '../../utils/embeds.js';

export const settingsOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownersettings')
    .setDescription('Configure bot settings')
    .addSubcommand((sub) =>
      sub
        .setName('public-commands')
        .setDescription('Global toggle for all public user commands')
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Enable or disable public commands')
            .setRequired(true)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const enabled = interaction.options.getBoolean('enabled', true);
    await interaction.deferReply({ ephemeral: true });

    await prisma.publicCommandSettings.upsert({
      where: { guildId },
      update: { enabled },
      create: { guildId, enabled },
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Settings Updated',
          `Public commands have been **${enabled ? 'ENABLED' : 'DISABLED'}** for this server.\n` +
          `*(Admin and Owner commands remain fully operational).*`
        ),
      ],
    });
  },
};
