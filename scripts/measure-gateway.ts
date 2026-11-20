import { Client, GatewayIntentBits } from 'discord.js';
import { env } from '../src/config/env.js';

async function measureGateway() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  console.log('Connecting to Discord Gateway...');
  await client.login(env.DISCORD_TOKEN);

  // Wait for initial heartbeat
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const samples: number[] = [];
  console.log('Collecting Gateway WebSocket heartbeat ping samples...');

  for (let i = 0; i < 30; i++) {
    const ping = client.ws.ping;
    if (ping > 0) {
      samples.push(ping);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  client.destroy();

  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = samples.length ? sum / samples.length : 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p95 = sorted[Math.min(p95Idx, sorted.length - 1)] ?? 0;

  console.log('\nDISCORD GATEWAY WEBSOCKET HEARTBEAT LATENCY (30 samples):');
  console.log(JSON.stringify({
    min: Number(min.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    max: Number(max.toFixed(2)),
  }));

  process.exit(0);
}

measureGateway().catch(console.error);
