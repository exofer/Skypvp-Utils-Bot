import { Worker, type Job } from 'bullmq';
import { redis } from '../utils/redis.js';
import { QUEUE_NAMES } from './queues.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bullmq-workers');

export interface JobHandlers {
  playerPolling?: (job: Job) => Promise<void>;
  auctionPolling?: (job: Job) => Promise<void>;
  eventMonitor?: (job: Job) => Promise<void>;
  kothMonitor?: (job: Job) => Promise<void>;
  strongholdMonitor?: (job: Job) => Promise<void>;
  outpostMonitor?: (job: Job) => Promise<void>;
  notifications?: (job: Job) => Promise<void>;
  cleanup?: (job: Job) => Promise<void>;
}

export class WorkerManager {
  private workers: Worker[] = [];

  public start(handlers: JobHandlers) {
    const queueHandlerMap: Array<[string, ((job: Job) => Promise<void>) | undefined]> = [
      [QUEUE_NAMES.PLAYER_POLLING, handlers.playerPolling],
      [QUEUE_NAMES.AUCTION_POLLING, handlers.auctionPolling],
      [QUEUE_NAMES.EVENT_MONITOR, handlers.eventMonitor],
      [QUEUE_NAMES.KOTH_MONITOR, handlers.kothMonitor],
      [QUEUE_NAMES.STRONGHOLD_MONITOR, handlers.strongholdMonitor],
      [QUEUE_NAMES.OUTPOST_MONITOR, handlers.outpostMonitor],
      [QUEUE_NAMES.NOTIFICATIONS, handlers.notifications],
      [QUEUE_NAMES.CLEANUP, handlers.cleanup],
    ];

    for (const [queueName, handler] of queueHandlerMap) {
      if (!handler) continue;

      const worker = new Worker(
        queueName,
        async (job: Job) => {
          log.debug({ queue: queueName, jobId: job.id }, 'Processing background job');
          await handler(job);
        },
        {
          connection: redis,
          concurrency: 5,
        }
      );

      worker.on('failed', (job, err) => {
        log.error({ queue: queueName, jobId: job?.id, error: err.message }, 'Job failed');
      });

      this.workers.push(worker);
    }

    log.info({ count: this.workers.length }, 'BullMQ workers started successfully');
  }

  public async stop(): Promise<void> {
    log.info('Shutting down BullMQ workers...');
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers = [];
  }
}

export const workerManager = new WorkerManager();
