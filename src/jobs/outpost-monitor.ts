import type { Job } from 'bullmq';
import { outpostService } from '../services/outpost.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-outpost-monitor');

export async function processOutpostMonitor(_job: Job): Promise<void> {
  log.debug('Running scheduled outpost monitor update');
  try {
    await outpostService.updateLiveEmbed(false);
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed during outpost monitor job');
  }
}
