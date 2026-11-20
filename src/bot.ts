import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  ActivityType,
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

  // Rotating status sequence featuring creator credit
  const statuses = [
    {
      name: 'SkyPvP Utils',
      type: ActivityType.Custom,
      state: '⚔️ SkyPvP Utils • Made by Exhaus (@xhaus.eta)',
    },
    {
      name: 'discord.gg/skypvp',
      type: ActivityType.Watching,
      state: '📡 SkyPvP Telemetry • by Exhaus (@xhaus.eta)',
    },
    {
      name: '/help | SkyPvP Utils',
      type: ActivityType.Listening,
      state: '👑 Made by Exhaus (@xhaus.eta)',
    },
    {
      name: 'Auction House (/ah)',
      type: ActivityType.Watching,
      state: '💰 Money & Gold AH • by Exhaus (@xhaus.eta)',
    },
    {
      name: 'Outpost & KoTH Wars',
      type: ActivityType.Competing,
      state: '⚔️ Warzone Events • by Exhaus (@xhaus.eta)',
    },
    {
      name: 'Teams & Clans (/team tops)',
      type: ActivityType.Watching,
      state: '🛡️ Clan Rankings • by Exhaus (@xhaus.eta)',
    },
  ];

  let statusIndex = 0;
  const updatePresence = () => {
    if (!client.user) return;
    const current = statuses[statusIndex % statuses.length];
    try {
      client.user.setPresence({
        activities: [current],
        status: 'online',
      });
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to update rotating Discord presence');
    }
    statusIndex++;
  };

  // Set initial status immediately
  updatePresence();

  // Rotate every 20 seconds
  setInterval(updatePresence, 20000);
});

client.on('interactionCreate', handleInteraction);
