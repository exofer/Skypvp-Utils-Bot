import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { infoEmbed } from '../../utils/embeds.js';

export const chatStatusCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('chatstatus')
    .setDescription('View the connection status of the Minecraft public chat bridge'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const status = mineflayerManager.getStatus();

    const embed = infoEmbed(
      'Minecraft Chat Bridge Status',
      `**Direction**: Strictly Minecraft ➔ Discord (One-Way)\n` +
      `**Connection**: ${status.connected ? '🟢 Connected' : '🔴 Disconnected'}\n` +
      `**Target Server**: \`${status.server}\` (SkyPvP)\n` +
      `**Bridge Status**: ${status.connected ? 'Forwarding permitted public chat' : 'Offline'}`
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
