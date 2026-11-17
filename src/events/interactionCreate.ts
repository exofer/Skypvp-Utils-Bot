import {
  type Interaction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { commands, buttonHandlers, modalHandlers, selectMenuHandlers } from '../bot.js';
import { checkPermission, isOwner } from '../permissions/guard.js';
import { PermissionLevel } from '../permissions/levels.js';
import { createLogger } from '../utils/logger.js';
import { errorEmbed, unauthorizedEmbed, publicCommandsDisabledEmbed } from '../utils/embeds.js';
import { prisma } from '../db/prisma.js';

const log = createLogger('interactionCreate');

export async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (err: any) {
    log.error({ err: err?.message ?? err }, 'Unhandled error during interaction processing');
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) {
    log.warn({ commandName: interaction.commandName }, 'Unknown command invoked');
    await interaction.reply({
      embeds: [errorEmbed('Command Not Found', 'This command is not registered.')],
      ephemeral: true,
    });
    return;
  }

  // Permission check
  const permCheck = await checkPermission(interaction, command.permission);
  if (!permCheck.allowed) {
    if (command.permission === PermissionLevel.PUBLIC) {
      await interaction.reply({
        embeds: [publicCommandsDisabledEmbed()],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [unauthorizedEmbed(permCheck.reason ?? 'You do not have permission to execute this command.')],
        ephemeral: true,
      });
    }
    return;
  }

  // Audit logging for Admin and Owner commands
  if (command.permission === PermissionLevel.ADMIN || command.permission === PermissionLevel.OWNER) {
    try {
      await prisma.adminAuditLog.create({
        data: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          action: `CMD:${interaction.commandName}`,
          details: JSON.parse(
            JSON.stringify({
              options: interaction.options.data,
              subcommand: interaction.options.getSubcommand(false),
            })
          ),
        },
      });
    } catch (e: any) {
      log.error({ err: e.message }, 'Failed to record admin audit log');
    }
  }

  try {
    await command.execute(interaction);
  } catch (err: any) {
    log.error({ command: interaction.commandName, err: err?.message, stack: err?.stack }, 'Command execution error');

    const replyPayload = {
      embeds: [
        errorEmbed(
          'Command Failed',
          'An unexpected error occurred while executing this command. The issue has been logged.',
        ),
      ],
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyPayload).catch(() => {});
    } else {
      await interaction.reply(replyPayload).catch(() => {});
    }
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  for (const handler of buttonHandlers) {
    if (interaction.customId.startsWith(handler.customId)) {
      if (handler.permission === PermissionLevel.OWNER && !isOwner(interaction.user.id)) {
        await interaction.reply({
          embeds: [unauthorizedEmbed('Only the bot owner can click this button.')],
          ephemeral: true,
        });
        return;
      }
      await handler.execute(interaction);
      return;
    }
  }
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  for (const handler of modalHandlers) {
    if (interaction.customId.startsWith(handler.customId)) {
      if (handler.permission === PermissionLevel.OWNER && !isOwner(interaction.user.id)) {
        await interaction.reply({
          embeds: [unauthorizedEmbed('Only the bot owner can submit this modal.')],
          ephemeral: true,
        });
        return;
      }
      await handler.execute(interaction);
      return;
    }
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  for (const handler of selectMenuHandlers) {
    if (interaction.customId.startsWith(handler.customId)) {
      if (handler.permission === PermissionLevel.OWNER && !isOwner(interaction.user.id)) {
        await interaction.reply({
          embeds: [unauthorizedEmbed('Only the bot owner can use this menu.')],
          ephemeral: true,
        });
        return;
      }
      await handler.execute(interaction);
      return;
    }
  }
}
