import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { auctionService } from '../../services/auction.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/minecraft.js';

export const auctionCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('auction')
    .setDescription('SkyPvP Auction House search and watch notifications')
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Search recently detected auction listings')
        .addStringOption((opt) =>
          opt.setName('item').setDescription('Item name to search for').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('watch')
        .setDescription('Set up a personal alert for an item listing')
        .addStringOption((opt) =>
          opt.setName('item').setDescription('Item name').setRequired(true)
        )
        .addNumberOption((opt) =>
          opt.setName('max_price').setDescription('Maximum price to alert for').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('watches').setDescription('View your active auction watches')
    )
    .addSubcommand((sub) =>
      sub.setName('watchlist').setDescription('Alias for viewing your auction watches')
    )
    .addSubcommand((sub) =>
      sub
        .setName('pause')
        .setDescription('Temporarily pause an auction watch')
        .addStringOption((opt) =>
          opt.setName('watch_id').setDescription('The ID of the watch').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('resume')
        .setDescription('Resume a paused auction watch')
        .addStringOption((opt) =>
          opt.setName('watch_id').setDescription('The ID of the watch').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete an auction watch')
        .addStringOption((opt) =>
          opt.setName('watch_id').setDescription('The ID of the watch').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('alerts')
        .setDescription('Toggle your personal DM auction alerts')
        .addStringOption((opt) =>
          opt
            .setName('state')
            .setDescription('Enable or disable alerts')
            .setRequired(true)
            .addChoices({ name: 'Enabled', value: 'on' }, { name: 'Disabled', value: 'off' })
        )
    ),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'search') {
      const itemQuery = interaction.options.getString('item', true);
      await interaction.deferReply();

      const listings = await prisma.auctionListing.findMany({
        where: {
          itemName: { contains: itemQuery, mode: 'insensitive' },
        },
        orderBy: { detectedAt: 'desc' },
        take: 5,
      });

      const embed = infoEmbed(
        `Auction Search: "${itemQuery}"`,
        `Showing the 5 most recent listings for **"${itemQuery}"**:`
      );

      if (listings.length === 0) {
        embed.setDescription(`No listings matching **"${itemQuery}"** have been detected yet.`);
      } else {
        for (const item of listings) {
          const buyout = item.buyoutPrice ? ` | Buyout: $${formatNumber(item.buyoutPrice)}` : '';
          embed.addFields({
            name: `${item.itemName} (x${item.quantity})`,
            value: `**Price**: $${formatNumber(item.currentPrice)}${buyout}\n**Seller**: \`${item.seller || 'Unknown'}\` • <t:${Math.floor(item.detectedAt.getTime() / 1000)}:R>`,
            inline: false,
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'watch') {
      const item = interaction.options.getString('item', true);
      const maxPrice = interaction.options.getNumber('max_price') ?? undefined;

      await interaction.deferReply({ ephemeral: true });

      try {
        const watch = await auctionService.createWatch(userId, item, maxPrice);
        const priceText = maxPrice ? `under **$${formatNumber(maxPrice)}**` : 'at any price';
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Auction Watch Created',
              `Now watching for **${item}** ${priceText}.\nYou will receive a DM when it appears on the Auction House.\n\n*Watch ID:* \`${watch.id}\``
            ),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Watch Failed', err.message)],
        });
      }
    } else if (sub === 'watches' || sub === 'watchlist') {
      await interaction.deferReply({ ephemeral: true });

      const watches = await auctionService.getWatches(userId);

      const embed = infoEmbed(
        'Your Auction Watches',
        `You have **${watches.length}/25** active watches:`
      );

      if (watches.length === 0) {
        embed.setDescription('You have no auction watches configured. Create one with `/auction watch`.');
      } else {
        const lines = watches.map((w) => {
          const statusIcon = w.status === 'ACTIVE' ? '🟢' : '⏸️';
          const price = w.maxPrice ? `≤ $${formatNumber(w.maxPrice)}` : 'Any Price';
          return `${statusIcon} **${w.itemName}** (${price}) — ID: \`${w.id}\``;
        });
        embed.addFields({ name: 'Active Watches', value: lines.join('\n') });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'pause') {
      const watchId = interaction.options.getString('watch_id', true);
      await interaction.deferReply({ ephemeral: true });

      await auctionService.pauseWatch(userId, watchId);
      await interaction.editReply({
        embeds: [successEmbed('Watch Paused', `Watch \`${watchId}\` has been paused.`)],
      });
    } else if (sub === 'resume') {
      const watchId = interaction.options.getString('watch_id', true);
      await interaction.deferReply({ ephemeral: true });

      await auctionService.resumeWatch(userId, watchId);
      await interaction.editReply({
        embeds: [successEmbed('Watch Resumed', `Watch \`${watchId}\` is now active.`)],
      });
    } else if (sub === 'delete') {
      const watchId = interaction.options.getString('watch_id', true);
      await interaction.deferReply({ ephemeral: true });

      await auctionService.deleteWatch(userId, watchId);
      await interaction.editReply({
        embeds: [successEmbed('Watch Deleted', `Watch \`${watchId}\` has been removed.`)],
      });
    } else if (sub === 'alerts') {
      const state = interaction.options.getString('state', true);
      const enabled = state === 'on';
      await interaction.deferReply({ ephemeral: true });

      await auctionService.toggleAlerts(userId, enabled);
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Alerts Updated',
            `Personal DM auction alerts have been **${enabled ? 'ENABLED' : 'DISABLED'}**.`
          ),
        ],
      });
    }
  },
};
