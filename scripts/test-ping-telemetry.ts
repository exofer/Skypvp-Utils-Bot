import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { REST, Routes } from 'discord.js';
import { env } from '../src/config/env.js';
import { redis } from '../src/utils/redis.js';
import { prisma } from '../src/db/prisma.js';
import { fetch, Agent } from 'undici';

const agent = new Agent({
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 600000,
  pipelining: 1,
  connections: 10,
});

async function testTelemetry() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  console.log('Testing Telemetry Components...\n');

  // 1. Redis
  const t0 = performance.now();
  await redis.ping();
  const redisMs = (performance.now() - t0).toFixed(2);

  // 2. Database
  const t1 = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbMs = (performance.now() - t1).toFixed(2);

  // 3. Discord REST
  const t2 = performance.now();
  await rest.get(Routes.gateway());
  const discordRestMs = (performance.now() - t2).toFixed(2);

  // 4. PikaNetwork API
  const t3 = performance.now();
  const pikaRes = await fetch('https://stats.pika-network.net/api/profile/JUJUMCR', {
    dispatcher: agent,
    headers: {
      'X-Api-Key': env.PIKA_API_KEY,
      Accept: 'application/json',
    },
  });
  await pikaRes.json();
  const pikaMs = (performance.now() - t3).toFixed(2);

  console.log('Redis Ping:', `${redisMs}ms`);
  console.log('Database Query:', `${dbMs}ms`);
  console.log('Discord REST API:', `${discordRestMs}ms`);
  console.log('PikaNetwork API:', `${pikaMs}ms`);

  process.exit(0);
}

testTelemetry().catch(console.error);
