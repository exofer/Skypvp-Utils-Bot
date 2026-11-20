import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { infoEmbed } from '../../utils/embeds.js';

export const chatCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Minecraft public chat bridge status and details')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('View the live connection status of the Minecraft chat bridge')
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const status = mineflayerManager.getStatus();

      const embed = infoEmbed(
        'Minecraft Chat Bridge Status',
        `**Direction**: Strictly Minecraft ➔ Discord (One-Way)\n` +
        `**Connection**: ${status.connected ? '🟢 Connected' : status.connecting ? '🟡 Connecting' : '🔴 Disconnected'}\n` +
        `**Account**: \`${status.username || 'None'}\`\n` +
        `**Target Server**: \`${status.server}\` (${status.inSkyPvP ? 'SkyPvP Active' : 'Lobby'})\n` +
        `**Bridge Status**: ${status.connected ? 'Forwarding permitted public chat' : 'Offline'}`
      );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
