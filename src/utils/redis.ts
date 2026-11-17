import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });

    redisInstance.on('connect', () => {
      log.info('Redis connection established');
    });

    redisInstance.on('error', (err) => {
      log.error({ err }, 'Redis connection error');
    });
  }

  return redisInstance;
}

export const redis = getRedisClient();
