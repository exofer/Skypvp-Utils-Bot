import { ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import { createLogger } from './logger.js';
import { errorEmbed } from './embeds.js';

const log = createLogger('errors');

/**
 * Base application error with an HTTP-style status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an external API call fails.
 */
export class ApiError extends AppError {
  public readonly endpoint: string;

  constructor(message: string, endpoint: string, statusCode = 502) {
    super(message, statusCode);
    this.name = 'ApiError';
    this.endpoint = endpoint;
  }
}

/**
 * Thrown when a user lacks the required permission.
 */
export class PermissionError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403);
    this.name = 'PermissionError';
  }
}

/**
 * Thrown when configuration is invalid or missing.
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 500, false);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when Mineflayer encounters an error.
 */
export class MineflayerError extends AppError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'MineflayerError';
  }
}

type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

/**
 * Global error handler for Discord interaction errors.
 * Sends a user-friendly error message without exposing stack traces.
 */
export async function handleInteractionError(
  interaction: AnyInteraction,
  error: unknown,
): Promise<void> {
  const errorMessage =
    error instanceof AppError && error.isOperational
      ? error.message
      : 'An unexpected error occurred. Please try again later.';

  log.error(
    {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: interaction.user.id,
      command:
        'commandName' in interaction
          ? interaction.commandName
          : interaction.customId,
      guildId: interaction.guildId,
    },
    'Interaction error',
  );

  const embed = errorEmbed('❌ Error', errorMessage);

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (replyError) {
    log.error(
      { error: replyError instanceof Error ? replyError.message : String(replyError) },
      'Failed to send error response to user',
    );
  }
}
