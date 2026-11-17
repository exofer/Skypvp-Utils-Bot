import { REST, Routes } from 'discord.js';
import { env } from './config/env.js';
import { createLogger } from './utils/logger.js';

// Public commands
import { profileCommand } from './commands/public/profile.js';
import { statsCommand } from './commands/public/stats.js';
import { compareCommand } from './commands/public/compare.js';
import { leaderboardCommand } from './commands/public/leaderboard.js';
import { fightsCommand } from './commands/public/fights.js';
import { killfeedCommand } from './commands/public/killfeed.js';
import { trackCommand } from './commands/public/track.js';
import { auctionCommand } from './commands/public/auction.js';
import { eventsCommand } from './commands/public/events.js';
import { chatStatusCommand } from './commands/public/chatStatus.js';
import { helpCommand } from './commands/public/help.js';
import { pingCommand } from './commands/public/ping.js';

// Admin commands
import { setupCommand } from './commands/admin/setup.js';
import { auctionFeedCommand } from './commands/admin/auctionFeed.js';

// Owner commands
import { updateLogsCommand } from './commands/owner/updatelogs.js';
import { ownerAccountCommand } from './commands/owner/account.js';
import { auctionOwnerCommand } from './commands/owner/auctionOwner.js';
import { eventsOwnerCommand } from './commands/owner/eventsOwner.js';
import { kothOwnerCommand } from './commands/owner/kothOwner.js';
import { strongholdOwnerCommand } from './commands/owner/strongholdOwner.js';
import { outpostOwnerCommand } from './commands/owner/outpostOwner.js';
import { chatOwnerCommand } from './commands/owner/chatOwner.js';
import { logsOwnerCommand } from './commands/owner/logsOwner.js';
import { settingsOwnerCommand } from './commands/owner/settingsOwner.js';
import { updatesOwnerCommand } from './commands/owner/updatesOwner.js';

const log = createLogger('command-registration');

const allCommands = [
  profileCommand,
  statsCommand,
  compareCommand,
  leaderboardCommand,
  fightsCommand,
  killfeedCommand,
  trackCommand,
  auctionCommand,
  eventsCommand,
  chatStatusCommand,
  helpCommand,
  pingCommand,
  setupCommand,
  auctionFeedCommand,
  updateLogsCommand,
  ownerAccountCommand,
  auctionOwnerCommand,
  eventsOwnerCommand,
  kothOwnerCommand,
  strongholdOwnerCommand,
  outpostOwnerCommand,
  chatOwnerCommand,
  logsOwnerCommand,
  settingsOwnerCommand,
  updatesOwnerCommand,
];

export async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const body = allCommands.map((c) => c.data.toJSON());

  try {
    log.info({ count: body.length }, 'Deploying slash commands to Discord API');

    if (env.DISCORD_TEST_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_TEST_GUILD_ID),
        { body }
      );
      log.info({ guildId: env.DISCORD_TEST_GUILD_ID }, 'Registered guild slash commands');
    } else {
      await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), { body });
      log.info('Registered global application slash commands');
    }
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed to register slash commands');
    throw err;
  }
}

// Allow direct CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  registerSlashCommands()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
