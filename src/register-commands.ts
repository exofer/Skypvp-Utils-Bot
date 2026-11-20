import { REST, Routes } from 'discord.js';
import { fetch } from 'undici';
import { env } from './config/env.js';
import { createLogger } from './utils/logger.js';

// Public commands
import { playerCommand } from './commands/public/player.js';
import { profileCommand } from './commands/public/profile.js';
import { statsCommand } from './commands/public/stats.js';
import { compareCommand } from './commands/public/compare.js';
import { leaderboardCommand } from './commands/public/leaderboard.js';
import { fightsCommand } from './commands/public/fights.js';
import { killfeedCommand } from './commands/public/killfeed.js';
import { auctionCommand } from './commands/public/auction.js';
import { eventsCommand } from './commands/public/events.js';
import { chatCommand } from './commands/public/chat.js';
import { chatStatusCommand } from './commands/public/chatStatus.js';
import { teamCommand } from './commands/public/team.js';
import { balCommand } from './commands/public/bal.js';
import { baltopCommand, baltopsCommand } from './commands/public/baltop.js';
import { helpCommand } from './commands/public/help.js';
import { pingCommand } from './commands/public/ping.js';

// Admin commands
import { setupCommand } from './commands/admin/setup.js';
import { configCommand } from './commands/admin/config.js';
import { alertsCommand } from './commands/admin/alerts.js';
import { trackingCommand } from './commands/admin/tracking.js';
import { serverStatsCommand } from './commands/admin/serverStats.js';
import { auctionFeedCommand } from './commands/admin/auctionFeed.js';

// Owner commands
import { ownerCommand } from './commands/owner/owner.js';
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
import { commandsOwnerCommand } from './commands/owner/commandsOwner.js';
import { ownersOwnerCommand } from './commands/owner/ownersOwner.js';

const log = createLogger('command-registration');

const allCommands = [
  playerCommand,
  profileCommand,
  statsCommand,
  compareCommand,
  leaderboardCommand,
  fightsCommand,
  killfeedCommand,
  auctionCommand,
  eventsCommand,
  chatCommand,
  chatStatusCommand,
  teamCommand,
  balCommand,
  baltopCommand,
  baltopsCommand,
  helpCommand,
  pingCommand,
  setupCommand,
  configCommand,
  alertsCommand,
  trackingCommand,
  serverStatsCommand,
  auctionFeedCommand,
  ownerCommand,
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
  commandsOwnerCommand,
  ownersOwnerCommand,
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

    // Update Discord Application Description
    try {
      const coolDesc = '⚔️ The ultimate utility bot for PikaNetwork SkyPvP • Made by Exhaus (@xhaus.eta)';

      await fetch('https://discord.com/api/v10/applications/@me', {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: coolDesc }),
      });
      log.info('Synchronized Discord application profile description');
    } catch (descErr: any) {
      log.warn({ err: descErr?.message }, 'Could not update Discord application description');
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
