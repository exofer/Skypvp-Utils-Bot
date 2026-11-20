import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Routes,
} from 'discord.js';
import { performance } from 'node:perf_hooks';
import { fetch, Agent } from 'undici';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { infoEmbed } from '../../utils/embeds.js';
import { redis } from '../../utils/redis.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { COLORS } from '../../config/constants.js';

const pikaAgent = new Agent({
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 600000,
  pipelining: 1,
  connections: 5,
});

export const pingCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency, Discord Gateway heartbeat, and service telemetry'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const execStart = performance.now();
    const wsPing = interaction.client.ws.ping;

    // Run independent latency benchmarks concurrently in parallel
    const [redisResult, dbResult, restResult, pikaResult] = await Promise.all([
      // 1. Redis Ping
      (async () => {
        try {
          const t0 = performance.now();
          await redis.ping();
          return { latency: Math.round(performance.now() - t0), connected: true };
        } catch {
          return { latency: 0, connected: false };
        }
      })(),

      // 2. Database Query
      (async () => {
        try {
          const t0 = performance.now();
          await prisma.$queryRaw`SELECT 1`;
          return { latency: Math.round(performance.now() - t0), connected: true };
        } catch {
          return { latency: 0, connected: false };
        }
      })(),

      // 3. Discord REST API
      (async () => {
        try {
          const t0 = performance.now();
          await interaction.client.rest.get(Routes.gateway());
          return { latency: Math.round(performance.now() - t0), connected: true };
        } catch {
          return { latency: 0, connected: false };
        }
      })(),

      // 4. PikaNetwork API
      (async () => {
        try {
          const t0 = performance.now();
          const res = await fetch('https://stats.pika-network.net/api/profile/JUJUMCR', {
            method: 'GET',
            dispatcher: pikaAgent,
            headers: {
              'X-Api-Key': env.PIKA_API_KEY,
              Accept: 'application/json',
              'User-Agent': 'SkyPvP-Utils-DiscordBot/1.0',
            },
          });
          if (res.ok) {
            await res.json();
            return { latency: Math.round(performance.now() - t0), online: true };
          }
          return { latency: Math.round(performance.now() - t0), online: false };
        } catch {
          return { latency: 0, online: false };
        }
      })(),
    ]);

    const execTime = Math.max(1, Math.round(performance.now() - execStart));
    const roundtrip = Math.max(1, Date.now() - interaction.createdTimestamp);

    const embed = infoEmbed(
      '🏓 Pong! Latency Telemetry',
      `Live latency and health diagnostics across all SkyPvP Utils services.`
    );
    embed.setColor(COLORS.INFO);

    embed.addFields([
      {
        name: '🌐 Discord Connectivity',
        value:
          `• **Gateway Heartbeat**: \`${wsPing >= 0 ? `${wsPing}ms` : 'Connecting...'}\`\n` +
          `• **REST API**: \`${restResult.latency}ms\` ${restResult.connected ? '🟢' : '🔴'}\n` +
          `• **Interaction Roundtrip**: \`${roundtrip}ms\``,
        inline: true,
      },
      {
        name: '⚡ Core Infrastructure',
        value:
          `• **Redis Cache**: ${redisResult.connected ? `\`${redisResult.latency}ms\` 🟢` : '🔴 Disconnected'}\n` +
          `• **Database (Prisma)**: ${dbResult.connected ? `\`${dbResult.latency}ms\` 🟢` : '🔴 Disconnected'}\n` +
          `• **Internal Processing**: \`${execTime}ms\``,
        inline: true,
      },
      {
        name: '🎮 External Integrations',
        value:
          `• **PikaNetwork API**: ${pikaResult.online ? `\`${pikaResult.latency}ms\` 🟢` : '🔴 Unreachable'}\n` +
          `• **Bot Uptime**: <t:${Math.floor((Date.now() - (interaction.client.uptime ?? 0)) / 1000)}:R>`,
        inline: false,
      },
    ]);

    embed.setFooter({
      text: `SkyPvP Utils • Gateway WebSocket: ${wsPing}ms | REST: ${restResult.latency}ms`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
