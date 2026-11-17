import type {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { PermissionLevel } from '../permissions/levels.js';

/**
 * A registered slash command module.
 */
export interface CommandModule {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  permission: PermissionLevel;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Handler for button interactions.
 */
export interface ButtonHandler {
  /** Custom ID prefix to match against. */
  customId: string;
  permission: PermissionLevel;
  execute: (interaction: ButtonInteraction) => Promise<void>;
}

/**
 * Handler for modal submit interactions.
 */
export interface ModalHandler {
  /** Custom ID prefix to match against. */
  customId: string;
  permission: PermissionLevel;
  execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}

/**
 * Handler for string select menu interactions.
 */
export interface SelectMenuHandler {
  /** Custom ID prefix to match against. */
  customId: string;
  permission: PermissionLevel;
  execute: (interaction: StringSelectMenuInteraction) => Promise<void>;
}
