import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { activeAuctionProvider } from '../../providers/auction.js';
import { auctionService } from '../../services/auction.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';

export const auctionOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('auctionowner')
    .setDescription('Owner controls for the auction ingestion system')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Inspect auction ingestion status and provider state')
    )
    .addSubcommand((sub) =>
      sub.setName('source').setDescription('Display auction source provider details and technical requirements')
    )
    .addSubcommand((sub) =>
      sub.setName('scrape').setDescription('Manually trigger an auction scrape (/ah) right now')
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'scrape') {
      const isAvailable = await activeAuctionProvider.isAvailable();
      if (!isAvailable) {
        await interaction.editReply({
          embeds: [errorEmbed('Auction Scraper Unavailable', 'Mineflayer bot is not currently connected to SkyPvP.')],
        });
        return;
      }

      try {
        const listings = await activeAuctionProvider.fetchListings();
        const newCount = await auctionService.processListings(listings);

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Auction Scrape Completed',
              `Successfully scraped **${listings.length}** listings from \`/ah\`.\nRecorded **${newCount}** new listings in database.`
            ),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Auction Scrape Failed', err?.message || 'An error occurred during auction scrape.')],
        });
      }
      return;
    } else if (sub === 'source') {
      const isAvailable = await activeAuctionProvider.isAvailable();
      const status = mineflayerManager.getStatus();

      const embed = infoEmbed(
        '👑 Auction Ingestion Architecture & Data Source',
        'Details on the PikaNetwork auction data ingestion mechanism.'
      );

      embed.addFields([
        {
          name: '📡 Active Provider',
          value: `\`${activeAuctionProvider.name}\` (In-game \`/ah\` GUI observation)`,
          inline: true,
        },
        {
          name: '🔌 Ingestion State',
          value: isAvailable ? '🟢 Operational' : '🔴 Offline / Waiting for SkyPvP connection',
          inline: true,
        },
        {
          name: '🤖 Bot Session',
          value: `Account: \`${status.username || 'None'}\` | In SkyPvP: ${status.inSkyPvP ? '✅ Yes' : '❌ No'}`,
          inline: false,
        },
        {
          name: '📋 Integration Requirements',
          value:
            '• Observation bot logged into PikaNetwork SkyPvP\n' +
            '• In-game execution of `/ah` to read populated chest inventory slots\n' +
            '• Real lore extraction (seller, start price, buyout price, duration)\n' +
            '• No fake data generation; strictly real PikaNetwork auction listings',
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Default: status
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
