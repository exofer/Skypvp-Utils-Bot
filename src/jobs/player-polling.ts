import type { Job } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { playerService } from '../services/player.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-player-polling');

export async function processPlayerPolling(_job: Job): Promise<void> {
  log.info('Running periodic player stat polling job');

  const trackedPlayers = await prisma.trackedPlayer.findMany({
    select: { id: true, playerName: true },
  });

  log.info({ count: trackedPlayers.length }, 'Found tracked players to snapshot');

  for (const player of trackedPlayers) {
    try {
      await playerService.captureSnapshot(player.id, player.playerName);
      // Brief pause between requests to respect API rate limits
      await new Promise((r) => setTimeout(r, 600));
    } catch (err: any) {
      log.warn({ player: player.playerName, err: err?.message }, 'Failed snapshot during periodic polling');
    }
  }

  log.info('Finished periodic player stat polling job');
}
