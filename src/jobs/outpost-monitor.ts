import type { Job } from 'bullmq';
import { outpostService } from '../services/outpost.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-outpost-monitor');

export async function processOutpostMonitor(_job: Job): Promise<void> {
  log.debug('Updating outpost status board');
  await outpostService.updateLiveEmbed();
}
