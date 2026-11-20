import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  DISCORD_OWNER_ID: z.string().min(1, 'DISCORD_OWNER_ID is required'),
  DISCORD_TEST_GUILD_ID: z.string().optional().default(''),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // PikaNetwork API
  PIKA_API_KEY: z.string().min(1, 'PIKA_API_KEY is required'),
  PIKA_API_BASE_URL: z
    .string()
    .url('PIKA_API_BASE_URL must be a valid URL')
    .default('https://stats.pika-network.net/api'),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be hexadecimal'),

  // Mineflayer
  MINEFLAYER_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MINEFLAYER_HOST: z.string().default('play.pika-network.net'),
  MINEFLAYER_PORT: z
    .string()
    .default('25565')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),

  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('production'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  // If running in test mode, inject mock values if missing
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'test_discord_token';
    process.env.DISCORD_APP_ID = process.env.DISCORD_APP_ID || '123456789012345678';
    process.env.DISCORD_OWNER_ID = process.env.DISCORD_OWNER_ID || '123456789012345678';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/testdb';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    process.env.PIKA_API_KEY = process.env.PIKA_API_KEY || 'test_pika_key';
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(
      `\n╔══════════════════════════════════════════╗\n` +
        `║   Environment Configuration Error        ║\n` +
        `╚══════════════════════════════════════════╝\n\n` +
        `The following environment variables are invalid or missing:\n\n` +
        `${formatted}\n\n` +
        `Copy .env.example to .env and fill in all required values.\n`,
    );

    process.exit(1);
  }

  return result.data;
}

export const env: Env = validateEnv();
