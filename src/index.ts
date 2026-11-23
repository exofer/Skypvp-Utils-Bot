import { env } from './config/env.js';
import { client, registerCommand } from './bot.js';
import { prisma } from './db/prisma.js';
import { redis } from './utils/redis.js';
import { createLogger } from './utils/logger.js';
import { workerManager } from './jobs/workers.js';
import { mineflayerManager } from './mineflayer/client.js';
import { mineflayerSecurity } from './mineflayer/security.js';
import './mineflayer/chat.js';
import './services/events.js';
import {
  playerPollingQueue,
  auctionPollingQueue,
  eventMonitorQueue,
  kothMonitorQueue,
  strongholdMonitorQueue,
  outpostMonitorQueue,
} from './jobs/queues.js';
import { POLLING_INTERVALS } from './config/constants.js';

// Import all background job processors
import { processPlayerPolling } from './jobs/player-polling.js';
import { processAuctionPolling } from './jobs/auction-polling.js';
import {
  processEventMonitor,
  processKothMonitor,
  processStrongholdMonitor,
} from './jobs/event-monitor.js';
import { processOutpostMonitor } from './jobs/outpost-monitor.js';

// Import all commands
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
import { setupCommand } from './commands/admin/setup.js';
import { configCommand } from './commands/admin/config.js';
import { alertsCommand } from './commands/admin/alerts.js';
import { trackingCommand } from './commands/admin/tracking.js';
import { serverStatsCommand } from './commands/admin/serverStats.js';
import { auctionFeedCommand } from './commands/admin/auctionFeed.js';
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

const log = createLogger('main');

async function bootstrap() {
  log.info('Starting SkyPvP Utils Discord Bot...');

  // 1. Verify Prisma connection
  try {
    await prisma.$connect();
    log.info('PostgreSQL connection verified via Prisma');
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed to connect to PostgreSQL database');
    process.exit(1);
  }

  // 2. Verify Redis connection
  try {
    await redis.ping();
    log.info('Redis connection verified');
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed to connect to Redis');
    process.exit(1);
  }

  // 3. Register all commands into collection
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

  for (const cmd of allCommands) {
    registerCommand(cmd);
  }
  log.info({ count: allCommands.length }, 'Loaded slash commands into memory');

  // 4. Start BullMQ background workers
  workerManager.start({
    playerPolling: processPlayerPolling,
    auctionPolling: processAuctionPolling,
    eventMonitor: processEventMonitor,
    kothMonitor: processKothMonitor,
    strongholdMonitor: processStrongholdMonitor,
    outpostMonitor: processOutpostMonitor,
  });

  // 5. Schedule recurring background jobs
  await playerPollingQueue.upsertJobScheduler(
    'player-polling-scheduler',
    { every: POLLING_INTERVALS.PLAYER_STATS },
    { name: 'poll-players' }
  );

  await auctionPollingQueue.upsertJobScheduler(
    'auction-polling-scheduler',
    { every: POLLING_INTERVALS.AUCTION },
    { name: 'poll-auction-house' }
  );

  await eventMonitorQueue.upsertJobScheduler(
    'event-monitor-scheduler',
    { every: POLLING_INTERVALS.EVENTS },
    { name: 'monitor-events' }
  );

  await kothMonitorQueue.upsertJobScheduler(
    'koth-monitor-scheduler',
    { every: POLLING_INTERVALS.KOTH },
    { name: 'monitor-koth' }
  );

  await strongholdMonitorQueue.upsertJobScheduler(
    'stronghold-monitor-scheduler',
    { every: POLLING_INTERVALS.STRONGHOLD },
    { name: 'monitor-stronghold' }
  );

  await outpostMonitorQueue.upsertJobScheduler(
    'outpost-monitor-scheduler',
    { every: POLLING_INTERVALS.OUTPOST },
    { name: 'monitor-outposts' }
  );

  log.info('Scheduled recurring BullMQ background jobs');

  // 6. Connect Discord client
  try {
    await client.login(env.DISCORD_TOKEN);
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed to log in to Discord gateway');
    process.exit(1);
  }

  // 7. Auto-connect stored Mineflayer account if configured
  try {
    const account = await prisma.mineflayerAccountConfig.findFirst({
      where: { enabled: true },
    });
    if (account) {
      const validation = await mineflayerSecurity.validateCredentials(account.guildId);
      if (!validation.valid) {
        log.warn(
          { guildId: account.guildId, error: validation.error },
          'Mineflayer startup auto-connect skipped: stored credentials failed decryption (ENCRYPTION_KEY may have changed)'
        );
      } else {
        const creds = await mineflayerSecurity.getCredentials(account.guildId);
        if (creds) {
          const proxy = await mineflayerSecurity.getProxy(account.guildId);
          log.info(
            { guildId: account.guildId, username: creds.username, proxyConfigured: !!proxy },
            'Auto-connecting configured Mineflayer account on startup'
          );
          mineflayerManager.connect(creds.username, creds.password, false, proxy || undefined).catch((err) => {
            log.error({ err: err?.message }, 'Error during Mineflayer auto-connect on startup');
          });
        }
      }
    }
  } catch (err: any) {
    log.warn({ err: err?.message }, 'Failed to check configured Mineflayer accounts on startup');
  }
}

// Graceful shutdown handling
async function shutdown(signal: string) {
  log.info({ signal }, 'Received termination signal, starting graceful shutdown...');

  try {
    await workerManager.stop();
    await client.destroy();
    await redis.quit();
    await prisma.$disconnect();
    log.info('Graceful shutdown completed clean');
    process.exit(0);
  } catch (err: any) {
    log.error({ err: err?.message }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err: any) => {
  log.error({ err: err?.message, stack: err?.stack }, 'Uncaught exception caught safely');
});

process.on('unhandledRejection', (reason: any) => {
  log.error({ reason: reason?.message || String(reason) }, 'Unhandled promise rejection caught safely');
});

bootstrap().catch((err) => {
  log.error({ err: err?.message, stack: err?.stack }, 'Fatal bootstrap failure');
  process.exit(1);
});
