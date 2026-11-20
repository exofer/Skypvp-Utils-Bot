import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { env } from '../src/config/env.js';
import { redis } from '../src/utils/redis.js';
import { prisma } from '../src/db/prisma.js';
import { fetch, Agent } from 'undici';

interface Stats {
  min: number;
  avg: number;
  median: number;
  p95: number;
  max: number;
}

function calcStats(numbers: number[]): Stats {
  if (numbers.length === 0) return { min: 0, avg: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p95 = sorted[Math.min(p95Idx, sorted.length - 1)];
  return {
    min: Number(min.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('   SKYPVP UTILS — FULL BENCHMARK (30 SAMPLES EACH)  ');
  console.log('====================================================\n');

  // 1. Event Loop Lag Monitor
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();

  // 2. Redis Benchmarks (30 samples)
  console.log('[1/6] Benchmarking Redis PING and Read/Write (30 samples)...');
  const redisPingSamples: number[] = [];
  const redisRwSamples: number[] = [];

  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    await redis.ping();
    redisPingSamples.push(performance.now() - t0);

    const t1 = performance.now();
    await redis.set(`bench:test:${i}`, 'value', 'EX', 10);
    await redis.get(`bench:test:${i}`);
    redisRwSamples.push(performance.now() - t1);
  }

  // 3. Database Benchmarks (30 samples)
  console.log('[2/6] Benchmarking Database Queries (30 samples)...');
  const dbRawSamples: number[] = [];
  const dbModelSamples: number[] = [];

  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    dbRawSamples.push(performance.now() - t0);

    const t1 = performance.now();
    await prisma.guildConfig.findFirst();
    dbModelSamples.push(performance.now() - t1);
  }

  // 4. Discord REST API Latency (30 samples)
  console.log('[3/6] Benchmarking Discord REST API Latency (30 samples)...');
  const discordRest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const discordRestGatewaySamples: number[] = [];
  const discordRestAuthSamples: number[] = [];

  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    await discordRest.get(Routes.gateway());
    discordRestGatewaySamples.push(performance.now() - t0);

    const t1 = performance.now();
    await discordRest.get(Routes.user('@me'));
    discordRestAuthSamples.push(performance.now() - t1);

    await new Promise((r) => setTimeout(r, 50));
  }

  // 5. Discord Gateway WebSocket Heartbeat Latency (30 samples)
  console.log('[4/6] Measuring Discord Gateway WebSocket Latency (30 samples)...');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(env.DISCORD_TOKEN);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const wsPingSamples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const ping = client.ws.ping;
    if (ping > 0) wsPingSamples.push(ping);
    await new Promise((r) => setTimeout(r, 200));
  }
  client.destroy();

  // 6. PikaNetwork API Latency (30 samples: Before without keep-alive vs After with keep-alive)
  console.log('[5/6] Benchmarking PikaNetwork API Latency (30 samples before vs after)...');
  const pikaDefaultSamples: number[] = [];
  const pikaKeepAliveSamples: number[] = [];

  const persistentAgent = new Agent({
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 600000,
    pipelining: 1,
    connections: 10,
  });

  for (let i = 0; i < 30; i++) {
    // Before: unoptimized new connection
    const t0 = performance.now();
    try {
      const res = await fetch('https://stats.pika-network.net/api/profile/JUJUMCR', {
        headers: {
          'X-Api-Key': env.PIKA_API_KEY,
          Accept: 'application/json',
        },
      });
      await res.json();
      pikaDefaultSamples.push(performance.now() - t0);
    } catch (_) {}

    // After: persistent keep-alive connection pool
    const t1 = performance.now();
    try {
      const res2 = await fetch('https://stats.pika-network.net/api/profile/JUJUMCR', {
        dispatcher: persistentAgent,
        headers: {
          'X-Api-Key': env.PIKA_API_KEY,
          Accept: 'application/json',
        },
      });
      await res2.json();
      pikaKeepAliveSamples.push(performance.now() - t1);
    } catch (_) {}
  }

  // Stop Event loop monitor
  histogram.disable();
  const eventLoopLagMin = histogram.min / 1e6;
  const eventLoopLagMean = histogram.mean / 1e6;
  const eventLoopLagP95 = histogram.percentile(95) / 1e6;
  const eventLoopLagMax = histogram.max / 1e6;

  // System Stats
  const memory = process.memoryUsage();

  console.log('\n====================================================');
  console.log('                 FINAL BENCHMARK REPORT             ');
  console.log('====================================================\n');

  console.log('1. REDIS PING (ms):', JSON.stringify(calcStats(redisPingSamples)));
  console.log('2. REDIS READ/WRITE (SET+GET) (ms):', JSON.stringify(calcStats(redisRwSamples)));
  console.log('3. DATABASE RAW SELECT 1 (ms):', JSON.stringify(calcStats(dbRawSamples)));
  console.log('4. DATABASE MODEL QUERY GuildConfig.findFirst (ms):', JSON.stringify(calcStats(dbModelSamples)));
  console.log('5. DISCORD REST GET /gateway (Regional Edge) (ms):', JSON.stringify(calcStats(discordRestGatewaySamples)));
  console.log('6. DISCORD REST GET /users/@me (Authenticated US-East Core) (ms):', JSON.stringify(calcStats(discordRestAuthSamples)));
  console.log('7. DISCORD GATEWAY WEBSOCKET HEARTBEAT (ms):', JSON.stringify(calcStats(wsPingSamples)));
  console.log('8. PIKANETWORK API BEFORE (Without Keep-Alive) (ms):', JSON.stringify(calcStats(pikaDefaultSamples)));
  console.log('9. PIKANETWORK API AFTER (With Persistent Keep-Alive) (ms):', JSON.stringify(calcStats(pikaKeepAliveSamples)));
  console.log('10. EVENT LOOP LAG (ms):', JSON.stringify({
    min: Number(eventLoopLagMin.toFixed(2)),
    avg: Number(eventLoopLagMean.toFixed(2)),
    p95: Number(eventLoopLagP95.toFixed(2)),
    max: Number(eventLoopLagMax.toFixed(2)),
  }));
  console.log('11. MEMORY USAGE (MB):', JSON.stringify({
    rss: (memory.rss / 1024 / 1024).toFixed(2),
    heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2),
  }));

  process.exit(0);
}

runBenchmark().catch(console.error);
