import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { activeAuctionProvider } from '../../providers/auction.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed } from '../../utils/embeds.js';

export const auctionOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('auctionowner')
    .setDescription('Owner controls for the auction ingestion system')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Inspect auction ingestion status and provider state')
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ ephemeral: true });

    const isAvailable = await activeAuctionProvider.isAvailable();
    const count = await prisma.auctionListing.count();
    const status = mineflayerManager.getStatus();

    const embed = infoEmbed(
      '👑 Auction Subsystem Status',
      `**Provider**: \`${activeAuctionProvider.name}\`\n` +
      `**Provider Available**: ${isAvailable ? '🟢 Yes' : '🔴 No'}\n` +
      `**Mineflayer Connected**: ${status.connected ? '🟢 Yes' : '🔴 No'}\n` +
      `**Total Discovered Listings in DB**: \`${count}\`\n` +
      `**Bot Target Server**: \`${status.server}\``
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
