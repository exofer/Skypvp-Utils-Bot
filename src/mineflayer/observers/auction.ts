import type { Bot } from 'mineflayer';
import { stripColorCodes } from '../../utils/minecraft.js';
import { createLogger } from '../../utils/logger.js';
import { mineflayerManager } from '../client.js';

const log = createLogger('auction-observer');

export interface DiscoveredAuctionListing {
  externalId: string;
  itemName: string;
  quantity: number;
  seller: string;
  startingPrice: number;
  currentPrice: number;
  buyoutPrice?: number;
  rawLore: string[];
}

export class AuctionObserver {
  private isScanning = false;

  /**
   * Run `/ah` in-game and parse the resulting inventory GUI
   */
  public async scrapeAuctionHouse(): Promise<DiscoveredAuctionListing[]> {
    if (!mineflayerManager.isConnected()) {
      log.debug('Cannot scrape auction house: Mineflayer bot is not connected');
      return [];
    }

    const bot = mineflayerManager.getBot();
    if (!bot) return [];

    if (this.isScanning) {
      log.warn('Auction scan already in progress');
      return [];
    }

    this.isScanning = true;

    try {
      log.info('Opening Auction House (/ah) via Mineflayer bot');
      const listings = await this.openAndParseWindow(bot);
      log.info({ count: listings.length }, 'Discovered active auction listings from /ah');
      return listings;
    } catch (err: any) {
      log.error({ err: err?.message }, 'Failed to parse auction house window');
      return [];
    } finally {
      this.isScanning = false;
    }
  }

  private openAndParseWindow(bot: Bot): Promise<DiscoveredAuctionListing[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        bot.removeListener('windowOpen', onWindow);
        reject(new Error('Timeout waiting for /ah GUI window to open'));
      }, 8000);

      const onWindow = async (window: any) => {
        clearTimeout(timeout);
        try {
          const title = stripColorCodes(window.title || '');
          log.debug({ title }, 'Auction House GUI window captured');

          const listings: DiscoveredAuctionListing[] = [];
          // Examine container slots (typically slots 0-44 are items, row 5 is pagination/buttons)
          const items = window.containerItems ? window.containerItems() : [];

          for (const item of items) {
            // Ignore UI controls (glass panes, arrows, barrier, book)
            if (
              item.name.includes('stained_glass_pane') ||
              item.name === 'arrow' ||
              item.name === 'barrier' ||
              item.name === 'book' ||
              item.name === 'compass'
            ) {
              continue;
            }

            const parsed = this.parseAuctionItem(item);
            if (parsed) {
              listings.push(parsed);
            }
          }

          // Close the window cleanly
          try {
            bot.closeWindow(window);
          } catch (_) {}

          resolve(listings);
        } catch (err) {
          reject(err);
        }
      };

      bot.once('windowOpen', onWindow);
      mineflayerManager.sendCommand('/ah');
    });
  }

  private parseAuctionItem(item: any): DiscoveredAuctionListing | null {
    try {
      const customName = item.customName ? stripColorCodes(item.customName) : null;
      const itemName = customName || item.displayName || item.name;
      const quantity = item.count || 1;

      // Extract raw lore lines
      const lore: string[] = [];
      const nbt = item.nbt;
      if (nbt && nbt.value && nbt.value.display && nbt.value.display.value && nbt.value.display.value.Lore) {
        const loreValue = nbt.value.display.value.Lore.value?.value;
        if (Array.isArray(loreValue)) {
          for (const line of loreValue) {
            try {
              if (typeof line === 'string') {
                const parsed = JSON.parse(line);
                lore.push(stripColorCodes(parsed.text || parsed.extra?.[0]?.text || line));
              } else {
                lore.push(stripColorCodes(String(line)));
              }
            } catch {
              lore.push(stripColorCodes(String(line)));
            }
          }
        }
      }

      // Parse seller, price, and buyout from lore
      let seller = 'Unknown';
      let price = 0;
      let buyoutPrice: number | undefined;

      for (const line of lore) {
        const lower = line.toLowerCase();

        // Seller parsing
        if (lower.includes('seller:') || lower.includes('seller :') || lower.includes('seller')) {
          const match = line.match(/seller:?\s*([a-zA-Z0-9_]{3,16})/i);
          if (match && match[1]) {
            seller = match[1];
          }
        }

        // Price parsing ($10,000 or Price: 10,000)
        if (lower.includes('price:') || lower.includes('starting bid:') || lower.includes('cost:')) {
          const cleaned = line.replace(/,/g, '');
          const match = cleaned.match(/(?:price|starting bid|cost):?\s*\$?([0-9.]+)/i);
          if (match && match[1]) {
            price = parseFloat(match[1]);
          }
        }

        // Buyout parsing
        if (lower.includes('buyout:') || lower.includes('buy now:')) {
          const cleaned = line.replace(/,/g, '');
          const match = cleaned.match(/(?:buyout|buy now):?\s*\$?([0-9.]+)/i);
          if (match && match[1]) {
            buyoutPrice = parseFloat(match[1]);
          }
        }
      }

      // Generate deterministic unique external ID
      const externalId = `${seller}_${itemName.replace(/\s+/g, '_')}_${price}_${quantity}`.toLowerCase();

      return {
        externalId,
        itemName,
        quantity,
        seller,
        startingPrice: price,
        currentPrice: price,
        buyoutPrice,
        rawLore: lore,
      };
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to parse individual item in AH GUI');
      return null;
    }
  }
}

export const auctionObserver = new AuctionObserver();
