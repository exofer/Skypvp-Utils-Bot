import type { Job } from 'bullmq';
import { eventService } from '../services/events.js';
import { kothService } from '../services/koth.js';
import { strongholdService } from '../services/stronghold.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-monitors');

export async function processEventMonitor(_job: Job): Promise<void> {
  log.debug('Checking SkyPvP events');
  await eventService.checkAndNotifyEvents();
}

export async function processKothMonitor(_job: Job): Promise<void> {
  log.debug('Checking KOTH status');
  await kothService.checkAndNotifyKoth();
}

export async function processStrongholdMonitor(_job: Job): Promise<void> {
  log.debug('Checking Stronghold status');
  await strongholdService.checkAndNotifyStronghold();
}
