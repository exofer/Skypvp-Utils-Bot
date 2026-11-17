import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import type {
  CommandModule,
  ButtonHandler,
  ModalHandler,
  SelectMenuHandler,
} from './types/index.js';
import { handleInteraction } from './events/interactionCreate.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('bot');

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

export const commands = new Collection<string, CommandModule>();
export const buttonHandlers: ButtonHandler[] = [];
export const modalHandlers: ModalHandler[] = [];
export const selectMenuHandlers: SelectMenuHandler[] = [];

export function registerCommand(command: CommandModule): void {
  commands.set(command.data.name, command);
  log.debug({ name: command.data.name }, 'Registered command');
}

export function registerButtonHandler(handler: ButtonHandler): void {
  buttonHandlers.push(handler);
}

export function registerModalHandler(handler: ModalHandler): void {
  modalHandlers.push(handler);
}

export function registerSelectMenuHandler(handler: SelectMenuHandler): void {
  selectMenuHandlers.push(handler);
}

client.once('ready', () => {
  log.info(
    { tag: client.user?.tag, guildCount: client.guilds.cache.size },
    'Discord bot client logged in and ready',
  );
});

client.on('interactionCreate', handleInteraction);
