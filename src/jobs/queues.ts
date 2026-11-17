import { Queue } from 'bullmq';
import { redis } from '../utils/redis.js';

export const QUEUE_NAMES = {
  PLAYER_POLLING: 'player-polling',
  AUCTION_POLLING: 'auction-polling',
  EVENT_MONITOR: 'event-monitor',
  KOTH_MONITOR: 'koth-monitor',
  STRONGHOLD_MONITOR: 'stronghold-monitor',
  OUTPOST_MONITOR: 'outpost-monitor',
  NOTIFICATIONS: 'notifications',
  CLEANUP: 'cleanup',
} as const;

const defaultQueueConfig = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
};

export const playerPollingQueue = new Queue(QUEUE_NAMES.PLAYER_POLLING, defaultQueueConfig);
export const auctionPollingQueue = new Queue(QUEUE_NAMES.AUCTION_POLLING, defaultQueueConfig);
export const eventMonitorQueue = new Queue(QUEUE_NAMES.EVENT_MONITOR, defaultQueueConfig);
export const kothMonitorQueue = new Queue(QUEUE_NAMES.KOTH_MONITOR, defaultQueueConfig);
export const strongholdMonitorQueue = new Queue(QUEUE_NAMES.STRONGHOLD_MONITOR, defaultQueueConfig);
export const outpostMonitorQueue = new Queue(QUEUE_NAMES.OUTPOST_MONITOR, defaultQueueConfig);
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, defaultQueueConfig);
export const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, defaultQueueConfig);
