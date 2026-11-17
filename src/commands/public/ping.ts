import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { infoEmbed } from '../../utils/embeds.js';
import { redis } from '../../utils/redis.js';

export const pingCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot websocket latency and service status'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sent = await interaction.reply({
      embeds: [infoEmbed('Pinging...', 'Measuring latency...')],
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;

    let redisStatus = 'Connected';
    try {
      await redis.ping();
    } catch {
      redisStatus = 'Disconnected';
    }

    const embed = infoEmbed(
      '🏓 Pong!',
      `**Roundtrip Latency**: \`${roundtrip}ms\`\n` +
      `**Discord Gateway**: \`${wsPing}ms\`\n` +
      `**Redis**: \`${redisStatus}\`\n` +
      `**Uptime**: <t:${Math.floor((Date.now() - (interaction.client.uptime ?? 0)) / 1000)}:R>`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
