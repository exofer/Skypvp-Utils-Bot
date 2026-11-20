import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
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
        .addStringOption((opt) =>
          opt
            .setName('currency')
            .setDescription('Filter by currency')
            .setRequired(false)
            .addChoices(
              { name: 'All Currencies', value: 'ALL' },
              { name: 'Money ($)', value: 'MONEY' },
              { name: 'Gold (🪙)', value: 'GOLD' }
            )
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
        .addStringOption((opt) =>
          opt
            .setName('currency')
            .setDescription('Filter by currency (Money, Gold, or Any)')
            .setRequired(false)
            .addChoices(
              { name: 'Any Currency', value: 'ANY' },
              { name: 'Money ($)', value: 'MONEY' },
              { name: 'Gold (🪙)', value: 'GOLD' }
            )
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
        .setName('edit')
        .setDescription('Edit an existing auction watch (item, max price, or currency)')
        .addStringOption((opt) =>
          opt.setName('watch_id').setDescription('The ID of the watch to edit').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('item').setDescription('New item name').setRequired(false)
        )
        .addNumberOption((opt) =>
          opt.setName('max_price').setDescription('New maximum price').setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('currency')
            .setDescription('Filter by currency (Money, Gold, or Any)')
            .setRequired(false)
            .addChoices(
              { name: 'Any Currency', value: 'ANY' },
              { name: 'Money ($)', value: 'MONEY' },
              { name: 'Gold (🪙)', value: 'GOLD' }
            )
        )
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
      const currencyFilter = interaction.options.getString('currency');
      await interaction.deferReply();

      const where: any = {
        itemName: { contains: itemQuery },
      };
      if (currencyFilter && currencyFilter !== 'ALL') {
        where.currency = currencyFilter;
      }

      const pageSize = 5;
      const totalCount = await prisma.auctionListing.count({ where });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      let currentPage = 1;

      const filterDesc = currencyFilter && currencyFilter !== 'ALL'
        ? ` (${currencyFilter === 'GOLD' ? '🪙 Gold only' : '💵 Money only'})`
        : '';

      const buildSearchEmbed = (page: number, items: any[]) => {
        const embed = infoEmbed(
          `Auction Search: "${itemQuery}"${filterDesc}`,
          totalCount === 0
            ? `No listings matching **"${itemQuery}"**${filterDesc} have been detected yet.`
            : `Showing page **${page}** of **${totalPages}** (${totalCount} total listings found):`
        );

        for (const item of items) {
          const isGold = item.currency === 'GOLD';
          const currBadge = isGold ? '🪙 Gold' : '💵 Money';
          const priceText = isGold ? `🪙 **${formatNumber(item.currentPrice)}** Gold` : `**$${formatNumber(item.currentPrice)}**`;
          const buyout = item.buyoutPrice
            ? ` | Buyout: ${isGold ? `🪙 ${formatNumber(item.buyoutPrice)} Gold` : `$${formatNumber(item.buyoutPrice)}`}`
            : '';
          embed.addFields({
            name: `${item.itemName} (x${item.quantity}) • [${currBadge}]`,
            value: `**Price**: ${priceText}${buyout}\n**Seller**: \`${item.seller || 'Unknown'}\` • <t:${Math.floor(item.detectedAt.getTime() / 1000)}:R>`,
            inline: false,
          });
        }

        embed.setFooter({ text: `Page ${page}/${totalPages} • SkyPvP AH Surfing` });
        return embed;
      };

      const buildActionRow = (page: number) => {
        const prevButton = new ButtonBuilder()
          .setCustomId(`ah_search_prev_${interaction.id}`)
          .setLabel('◀️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page <= 1);

        const pageIndicator = new ButtonBuilder()
          .setCustomId(`ah_search_page_${interaction.id}`)
          .setLabel(`${page} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const nextButton = new ButtonBuilder()
          .setCustomId(`ah_search_next_${interaction.id}`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, pageIndicator, nextButton);
      };

      if (totalCount === 0) {
        await interaction.editReply({ embeds: [buildSearchEmbed(1, [])] });
        return;
      }

      const initialListings = await prisma.auctionListing.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip: 0,
        take: pageSize,
      });

      const responseMsg = await interaction.editReply({
        embeds: [buildSearchEmbed(1, initialListings)],
        components: totalPages > 1 ? [buildActionRow(1)] : [],
      });

      if (totalPages > 1) {
        const collector = responseMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 120_000,
        });

        collector.on('collect', async (btn) => {
          if (btn.user.id !== interaction.user.id) {
            await btn.reply({
              content: 'Only the user who searched can navigate pages.',
              ephemeral: true,
            });
            return;
          }

          if (btn.customId.startsWith('ah_search_prev_')) {
            if (currentPage > 1) currentPage--;
          } else if (btn.customId.startsWith('ah_search_next_')) {
            if (currentPage < totalPages) currentPage++;
          }

          const pageListings = await prisma.auctionListing.findMany({
            where,
            orderBy: { detectedAt: 'desc' },
            skip: (currentPage - 1) * pageSize,
            take: pageSize,
          });

          await btn.update({
            embeds: [buildSearchEmbed(currentPage, pageListings)],
            components: [buildActionRow(currentPage)],
          });
        });

        collector.on('end', async () => {
          try {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('ah_prev_done')
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('ah_page_done')
                .setLabel(`${currentPage} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('ah_next_done')
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
            );
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
          } catch (_) {}
        });
      }
    } else if (sub === 'watch') {
      const item = interaction.options.getString('item', true);
      const maxPrice = interaction.options.getNumber('max_price') ?? undefined;
      const currency = interaction.options.getString('currency') ?? 'ANY';

      await interaction.deferReply({ ephemeral: true });

      try {
        const watch = await auctionService.createWatch(userId, item, maxPrice, currency);
        const isGold = currency === 'GOLD';
        const priceSymbol = isGold ? '🪙 ' : '$';
        const priceSuffix = isGold ? ' Gold' : '';
        const currDesc = isGold ? ' [🪙 Gold only]' : currency === 'MONEY' ? ' [💵 Money only]' : ' [Any Currency]';
        const priceText = maxPrice ? `under **${priceSymbol}${formatNumber(maxPrice)}${priceSuffix}**` : 'at any price';

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Auction Watch Created',
              `Now watching for **${item}** ${priceText}${currDesc}.\nYou will receive a DM when it appears on the Auction House.\n\n*Watch ID:* \`${watch.id}\``
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
          const isGold = w.currency === 'GOLD';
          const currBadge = isGold ? '🪙 Gold' : w.currency === 'MONEY' ? '💵 Money' : 'Any';
          const price = w.maxPrice
            ? (isGold ? `≤ 🪙 ${formatNumber(w.maxPrice)} Gold` : `≤ $${formatNumber(w.maxPrice)}`)
            : 'Any Price';
          return `${statusIcon} **${w.itemName}** (${price} • [${currBadge}]) — ID: \`${w.id}\``;
        });
        embed.addFields({ name: 'Active Watches', value: lines.join('\n') });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'edit') {
      const watchId = interaction.options.getString('watch_id', true);
      const newItem = interaction.options.getString('item');
      const newMaxPrice = interaction.options.getNumber('max_price');
      const newCurrency = interaction.options.getString('currency');

      await interaction.deferReply({ ephemeral: true });

      const watch = await prisma.auctionWatch.findFirst({
        where: { id: watchId, user: { discordId: userId } },
      });

      if (!watch) {
        await interaction.editReply({
          embeds: [errorEmbed('Watch Not Found', `No watch found with ID \`${watchId}\`.`)],
        });
        return;
      }

      const updated = await prisma.auctionWatch.update({
        where: { id: watchId },
        data: {
          ...(newItem ? { itemName: newItem } : {}),
          ...(newMaxPrice !== null && newMaxPrice !== undefined ? { maxPrice: newMaxPrice > 0 ? newMaxPrice : null } : {}),
          ...(newCurrency ? { currency: newCurrency } : {}),
        },
      });

      const isGold = updated.currency === 'GOLD';
      const currLabel = isGold ? '🪙 Gold' : updated.currency === 'MONEY' ? '💵 Money' : 'Any Currency';
      const priceStr = updated.maxPrice
        ? (isGold ? `🪙 ${formatNumber(updated.maxPrice)} Gold` : `$${formatNumber(updated.maxPrice)}`)
        : 'Any price';
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Auction Watch Updated',
            `Watch **#${updated.id.slice(-6)}** updated:\n• **Item**: \`${updated.itemName}\`\n• **Max Price**: ${priceStr}\n• **Currency**: ${currLabel}`
          ),
        ],
      });
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
