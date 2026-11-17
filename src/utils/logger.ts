import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'skypvp-utils',
  },
  // Redact sensitive fields from logs
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'encryptionKey',
      'DISCORD_TOKEN',
      'ENCRYPTION_KEY',
      'PIKA_API_KEY',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with a specific module context.
 *
 * @example
 * ```ts
 * const log = createLogger('auction');
 * log.info('Polling auctions...');
 * ```
 */
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}
