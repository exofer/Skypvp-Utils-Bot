import { performance } from 'node:perf_hooks';
import { REST, Routes } from 'discord.js';
import { env } from '../src/config/env.js';

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

async function runAckBenchmark() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const ackTimes: number[] = [];
  const restGetTimes: number[] = [];

  console.log('Running 30 iterations of Discord REST interaction / API calls...');

  for (let i = 0; i < 30; i++) {
    // 1. Direct gateway query (measuring REST roundtrip for lightweight endpoint)
    const t0 = performance.now();
    await rest.get(Routes.gateway());
    ackTimes.push(performance.now() - t0);

    // 2. Current user endpoint (measuring authenticated Discord REST endpoint)
    const t1 = performance.now();
    await rest.get(Routes.user('@me'));
    restGetTimes.push(performance.now() - t1);

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log('\nDISCORD REST /gateway (30 samples):', JSON.stringify(calcStats(ackTimes)));
  console.log('DISCORD REST /users/@me (30 samples):', JSON.stringify(calcStats(restGetTimes)));
  process.exit(0);
}

runAckBenchmark().catch(console.error);
