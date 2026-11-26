import { prisma } from '../db/prisma.js';
import { client } from '../bot.js';
import {
  auctionObserver,
  MAX_LEGACY_AUCTION_AGE_MS,
  buildActiveAuctionWhere,
  type DiscoveredAuctionListing,
} from '../mineflayer/observers/auction.js';
import { createLogger } from '../utils/logger.js';
import { infoEmbed } from '../utils/embeds.js';
import { COLORS } from '../config/constants.js';
import { formatNumber } from '../utils/minecraft.js';

export { buildActiveAuctionWhere };

const log = createLogger('auction-service');

export class AuctionService {
  /**
   * Process a batch of scraped listings and expire listings no longer on the market.
   */
  public async processListings(listings: DiscoveredAuctionListing[]): Promise<number> {
    const now = new Date();
    const maxAgeCutoff = new Date(now.getTime() - MAX_LEGACY_AUCTION_AGE_MS);

    // Always expire listings whose explicit expiration time or max age has passed
    try {
      await prisma.auctionListing.updateMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { expiresAt: { lte: now } },
            { expiresAt: null, detectedAt: { lte: maxAgeCutoff } },
          ],
        },
        data: { status: 'EXPIRED' },
      });
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to expire aged auction listings');
    }

    if (listings.length === 0) return 0;

    let newCount = 0;

    for (const item of listings) {
      try {
        // Check if listing was already recorded
        const existing = await prisma.auctionListing.findUnique({
          where: { externalId: item.externalId },
        });

        if (existing) {
          // Keep active and refresh expiresAt if newly parsed
          if (existing.status !== 'ACTIVE' || (item.expiresAt && !existing.expiresAt)) {
            await prisma.auctionListing.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                expiresAt: item.expiresAt ?? existing.expiresAt,
              },
            });
          }
          continue;
        }

        // Record listing in DB
        const created = await prisma.auctionListing.create({
          data: {
            externalId: item.externalId,
            itemName: item.itemName,
            quantity: item.quantity,
            seller: item.seller,
            startingPrice: item.startingPrice,
            currentPrice: item.currentPrice,
            buyoutPrice: item.buyoutPrice,
            currency: item.currency || 'MONEY',
            expiresAt: item.expiresAt ?? null,
            status: 'ACTIVE',
          },
        });

        newCount++;

        // 1. Dispatch to public feed channels
        await this.broadcastToPublicFeeds(created);

        // 2. Dispatch personal watch alerts
        await this.matchAndNotifyWatches(created);
      } catch (err: any) {
        log.error({ err: err?.message, externalId: item.externalId }, 'Error processing auction listing');
      }
    }

    // Reconcile listings that disappeared from the scraped AH page
    try {
      const activeExternalIds = listings.map((l) => l.externalId);
      if (auctionObserver.lastTotalPages === 1) {
        await prisma.auctionListing.updateMany({
          where: {
            status: 'ACTIVE',
            externalId: { notIn: activeExternalIds },
          },
          data: { status: 'EXPIRED' },
        });
      } else {
        // Multi-page AH: only expire items newer than the oldest item still visible on Page 1
        const oldestOnPage1 = await prisma.auctionListing.findFirst({
          where: { externalId: { in: activeExternalIds } },
          orderBy: { detectedAt: 'asc' },
          select: { detectedAt: true },
        });

        if (oldestOnPage1) {
          await prisma.auctionListing.updateMany({
            where: {
              status: 'ACTIVE',
              detectedAt: { gt: oldestOnPage1.detectedAt },
              externalId: { notIn: activeExternalIds },
            },
            data: { status: 'EXPIRED' },
          });
        }
      }
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to reconcile disappeared auction listings');
    }

    return newCount;
  }

  /**
   * Broadcast newly detected listing to all guilds with public feed enabled
   */
  private async broadcastToPublicFeeds(listing: any): Promise<void> {
    const guilds = await prisma.guildConfig.findMany({
      where: {
        auctionFeedEnabled: true,
        auctionFeedChannelId: { not: null },
      },
    });

    const isGold = listing.currency === 'GOLD';
    const priceText = isGold
      ? `🪙 **${formatNumber(listing.currentPrice)}** Gold`
      : `💵 **$${formatNumber(listing.currentPrice)}**`;

    const embed = infoEmbed(
      isGold ? '🪙 New SkyPvP Gold Auction Listing' : '🏷️ New SkyPvP Auction Listing',
      `**${listing.itemName}** has been listed on the SkyPvP Auction House!`
    );
    embed.setColor(isGold ? 0xffaa00 : COLORS.AUCTION);

    embed.addFields([
      { name: '📦 Item', value: `${listing.itemName} (x${listing.quantity})`, inline: true },
      { name: '👤 Seller', value: `\`${listing.seller || 'Unknown'}\``, inline: true },
      { name: isGold ? '🪙 Price (Gold)' : '💰 Price', value: priceText, inline: true },
    ]);

    if (listing.buyoutPrice) {
      const buyoutText = isGold
        ? `🪙 **${formatNumber(listing.buyoutPrice)}** Gold`
        : `💵 **$${formatNumber(listing.buyoutPrice)}**`;
      embed.addFields({
        name: isGold ? '⚡ Buyout (Gold)' : '⚡ Buyout Price',
        value: buyoutText,
        inline: true,
      });
    }

    for (const g of guilds) {
      if (!g.auctionFeedChannelId) continue;
      try {
        const channel = await client.channels.fetch(g.auctionFeedChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          await (channel as any).send({ embeds: [embed] });
        }
      } catch (err: any) {
        log.warn({ guildId: g.guildId, err: err?.message }, 'Failed to deliver public auction alert');
      }
    }
  }

  /**
   * Match listing against active user AuctionWatches and send DMs
   */
  private async matchAndNotifyWatches(listing: any): Promise<void> {
    const watches = await prisma.auctionWatch.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
    });

    for (const watch of watches) {
      // Must have user alerts enabled
      if (!watch.user.auctionAlertsEnabled || !watch.user.dmAlertsEnabled) {
        continue;
      }

      // Check currency match
      if (watch.currency && watch.currency !== 'ANY') {
        const listingCurrency = listing.currency || 'MONEY';
        if (watch.currency.toUpperCase() !== listingCurrency.toUpperCase()) {
          continue;
        }
      }

      // Check item name match (case-insensitive substring)
      const nameMatch = listing.itemName.toLowerCase().includes(watch.itemName.toLowerCase());
      if (!nameMatch) continue;

      // Check max price threshold
      if (watch.maxPrice !== null && listing.currentPrice > watch.maxPrice) {
        continue;
      }

      // Send private DM
      await this.sendDmAlert(watch.user.discordId, watch, listing);
    }
  }

  private async sendDmAlert(discordId: string, watch: any, listing: any): Promise<void> {
    try {
      const user = await client.users.fetch(discordId);
      if (!user) return;

      const isGold = listing.currency === 'GOLD';
      const listedPriceStr = isGold
        ? `🪙 ${formatNumber(listing.currentPrice)} Gold`
        : `$${formatNumber(listing.currentPrice)}`;

      let maxPriceStr = 'None';
      if (watch.maxPrice) {
        const isWatchGold = watch.currency === 'GOLD' || (watch.currency === 'ANY' && isGold);
        maxPriceStr = isWatchGold
          ? `🪙 ${formatNumber(watch.maxPrice)} Gold`
          : `$${formatNumber(watch.maxPrice)}`;
      }

      const embed = infoEmbed(
        isGold ? '🪙 Gold Auction Watch Alert!' : '🔔 Auction Watch Alert!',
        `An item matching your watch for **"${watch.itemName}"** was just detected on the SkyPvP Auction House!`
      );
      embed.setColor(isGold ? 0xffaa00 : COLORS.AUCTION);

      embed.addFields([
        { name: '📦 Item', value: `${listing.itemName} (x${listing.quantity})`, inline: true },
        { name: isGold ? '🪙 Listed Price' : '💰 Listed Price', value: listedPriceStr, inline: true },
        {
          name: '🎯 Your Max Price',
          value: maxPriceStr,
          inline: true,
        },
        { name: '👤 Seller', value: `\`${listing.seller || 'Unknown'}\``, inline: true },
      ]);

      await user.send({ embeds: [embed] });
    } catch (err: any) {
      // User has DMs closed or blocked the bot — fail gracefully
      log.debug({ discordId, err: err?.message }, 'Could not deliver personal auction DM');
    }
  }

  /**
   * User watch management methods
   */
  public async createWatch(userId: string, itemName: string, maxPrice?: number, currency: string = 'ANY') {
    const user = await prisma.userProfile.upsert({
      where: { discordId: userId },
      update: {},
      create: { discordId: userId },
    });

    const currentCount = await prisma.auctionWatch.count({
      where: { userId: user.id, status: { not: 'DELETED' } },
    });

    if (currentCount >= 25) {
      throw new Error('You have reached the maximum of 25 active auction watches.');
    }

    return prisma.auctionWatch.create({
      data: {
        userId: user.id,
        itemName,
        maxPrice,
        currency: currency.toUpperCase(),
      },
    });
  }

  public async getWatches(userId: string) {
    const user = await prisma.userProfile.findUnique({ where: { discordId: userId } });
    if (!user) return [];

    return prisma.auctionWatch.findMany({
      where: { userId: user.id, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async pauseWatch(userId: string, watchId: string) {
    const user = await prisma.userProfile.findUnique({ where: { discordId: userId } });
    if (!user) throw new Error('User not found.');

    return prisma.auctionWatch.updateMany({
      where: { id: watchId, userId: user.id },
      data: { status: 'PAUSED' },
    });
  }

  public async resumeWatch(userId: string, watchId: string) {
    const user = await prisma.userProfile.findUnique({ where: { discordId: userId } });
    if (!user) throw new Error('User not found.');

    return prisma.auctionWatch.updateMany({
      where: { id: watchId, userId: user.id },
      data: { status: 'ACTIVE' },
    });
  }

  public async deleteWatch(userId: string, watchId: string) {
    const user = await prisma.userProfile.findUnique({ where: { discordId: userId } });
    if (!user) throw new Error('User not found.');

    return prisma.auctionWatch.updateMany({
      where: { id: watchId, userId: user.id },
      data: { status: 'DELETED' },
    });
  }

  public async toggleAlerts(userId: string, enabled: boolean) {
    return prisma.userProfile.upsert({
      where: { discordId: userId },
      update: { auctionAlertsEnabled: enabled },
      create: { discordId: userId, auctionAlertsEnabled: enabled },
    });
  }
}

export const auctionService = new AuctionService();
