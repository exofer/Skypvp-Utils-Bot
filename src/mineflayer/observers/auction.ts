import type { Bot } from 'mineflayer';
import nbt from 'prismarine-nbt';
import { stripColorCodes } from '../../utils/minecraft.js';
import { createLogger } from '../../utils/logger.js';
import { mineflayerManager } from '../client.js';

const log = createLogger('auction-observer');

export type AuctionCurrency = 'MONEY' | 'GOLD';

export interface DiscoveredAuctionListing {
  externalId: string;
  itemName: string;
  quantity: number;
  seller: string;
  startingPrice: number;
  currentPrice: number;
  buyoutPrice?: number;
  currency: AuctionCurrency;
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
      }, 10000);

      const onWindow = async (window: any) => {
        clearTimeout(timeout);
        try {
          const title = stripColorCodes(window.title || '');
          log.info({ title }, 'Auction House GUI window captured');

          const listings: DiscoveredAuctionListing[] = [];
          // Examine container slots (slots 0-44 are item listings, row 5 (45-53) is pagination/buttons)
          const items = window.containerItems ? window.containerItems() : [];

          for (const item of items) {
            // Ignore bottom navigation bar (slots 45-53)
            if (item.slot !== undefined && item.slot >= 45) {
              continue;
            }

            // Ignore common UI controls (glass panes, arrows, barrier)
            if (
              item.name.includes('stained_glass_pane') ||
              item.name === 'arrow' ||
              item.name === 'barrier'
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
          try {
            bot.closeWindow(window);
          } catch (_) {}
          reject(err);
        }
      };

      bot.once('windowOpen', onWindow);
      mineflayerManager.sendCommand('/ah');
    });
  }

  public parseAuctionItem(item: any): DiscoveredAuctionListing | null {
    try {
      if (!item) return null;

      // Ignore bottom control row (slots 45-53)
      if (item.slot !== undefined && item.slot >= 45) {
        return null;
      }

      const customName = item.customName ? stripColorCodes(item.customName) : null;
      const itemName = customName || item.displayName || item.name;
      const quantity = item.count || 1;

      // Extract raw lore lines from prismarine-item customLore, simplified NBT, or raw NBT
      const rawLoreLines: any[] = [];
      if (Array.isArray(item.customLore)) {
        rawLoreLines.push(...item.customLore);
      } else if (item.nbt) {
        try {
          const simplified: any = nbt.simplify(item.nbt);
          const sLore = simplified?.display?.Lore || simplified?.display?.lore;
          if (Array.isArray(sLore)) {
            rawLoreLines.push(...sLore);
          }
        } catch (_) {}

        if (rawLoreLines.length === 0 && item.nbt.value?.display?.value?.Lore?.value?.value) {
          const lv = item.nbt.value.display.value.Lore.value.value;
          if (Array.isArray(lv)) {
            rawLoreLines.push(...lv);
          }
        }
      }

      const lore: string[] = [];
      for (const rawLine of rawLoreLines) {
        const text = stripColorCodes(rawLine);
        if (text) {
          lore.push(text);
        }
      }

      // Parse seller, price, buyout, and currency from lore
      let seller = 'Unknown';
      let price = 0;
      let buyoutPrice: number | undefined;
      let detectedCurrency: AuctionCurrency = 'MONEY';

      // First pass: check for explicit Currency: lines
      for (const line of lore) {
        const lower = line.toLowerCase();
        if (lower.includes('currency:')) {
          if (lower.includes('gold') || lower.includes('⛃')) {
            detectedCurrency = 'GOLD';
          } else if (lower.includes('money') || lower.includes('coins') || lower.includes('$')) {
            detectedCurrency = 'MONEY';
          }
        }
      }

      for (const line of lore) {
        const lower = line.toLowerCase();

        // Seller parsing
        if (
          lower.includes('seller:') ||
          lower.includes('seller :') ||
          lower.includes('sold by:') ||
          lower.includes('listed by:') ||
          lower.includes('seller')
        ) {
          const match = line.match(
            /(?:seller|sold by|listed by):?\s*(?:\[[^\]]+\]\s*)?(?:<[^>]+>\s*)?([a-zA-Z0-9_]{3,16})/i
          );
          if (match && match[1]) {
            seller = match[1];
          }
        }

        // Price parsing ($10,000 or Price: 10,000 or 10k or 10m or 500 Gold or 500 ⛃)
        if (
          lower.includes('price:') ||
          lower.includes('starting bid:') ||
          lower.includes('bid:') ||
          lower.includes('cost:')
        ) {
          if (lower.includes('gold') || lower.includes('⛃') || /\b\d+g\b/i.test(line)) {
            detectedCurrency = 'GOLD';
          } else if (line.includes('$') || lower.includes('coins') || lower.includes('money')) {
            detectedCurrency = 'MONEY';
          }

          const cleaned = line.replace(/,/g, '');
          const match = cleaned.match(/(?:price|starting bid|bid|cost):?\s*(?:\$|⛃)?\s*([0-9.]+)\s*(k|m|b)?(?:\s*(?:gold|coins?|g|⛃))?/i);
          if (match && match[1]) {
            let val = parseFloat(match[1]);
            const suffix = match[2]?.toLowerCase();
            if (suffix === 'k') val *= 1000;
            if (suffix === 'm') val *= 1000000;
            if (suffix === 'b') val *= 1000000000;
            if (!isNaN(val) && val > 0) {
              price = val;
            }
          }
        }

        // Buyout parsing
        if (
          lower.includes('buyout:') ||
          lower.includes('buy now:') ||
          lower.includes('buy it now:')
        ) {
          if (lower.includes('gold') || lower.includes('⛃') || /\b\d+g\b/i.test(line)) {
            detectedCurrency = 'GOLD';
          } else if (line.includes('$') || lower.includes('coins') || lower.includes('money')) {
            detectedCurrency = 'MONEY';
          }

          const cleaned = line.replace(/,/g, '');
          const match = cleaned.match(/(?:buyout|buy now|buy it now):?\s*(?:\$|⛃)?\s*([0-9.]+)\s*(k|m|b)?(?:\s*(?:gold|coins?|g|⛃))?/i);
          if (match && match[1]) {
            let val = parseFloat(match[1]);
            const suffix = match[2]?.toLowerCase();
            if (suffix === 'k') val *= 1000;
            if (suffix === 'm') val *= 1000000;
            if (suffix === 'b') val *= 1000000000;
            if (!isNaN(val) && val > 0) {
              buyoutPrice = val;
            }
          }
        }
      }

      // If price was not found under 'Price:' but buyout is present, use buyoutPrice
      if (price <= 0 && buyoutPrice && buyoutPrice > 0) {
        price = buyoutPrice;
      }

      // Check for standalone price pattern if still not found
      if (price <= 0) {
        for (const line of lore) {
          // Check for $100,000 or $50k
          let match = line.replace(/,/g, '').match(/\$([0-9.]+)\s*(k|m|b)?/i);
          if (match && match[1]) {
            let val = parseFloat(match[1]);
            const suffix = match[2]?.toLowerCase();
            if (suffix === 'k') val *= 1000;
            if (suffix === 'm') val *= 1000000;
            if (suffix === 'b') val *= 1000000000;
            if (!isNaN(val) && val > 0) {
              price = val;
              detectedCurrency = 'MONEY';
              break;
            }
          }

          // Check for 500 Gold or ⛃ 500
          match = line.replace(/,/g, '').match(/(?:⛃\s*([0-9.]+)|([0-9.]+)\s*(k|m|b)?\s*gold)/i);
          if (match) {
            const numStr = match[1] || match[2];
            if (numStr) {
              let val = parseFloat(numStr);
              const suffix = match[3]?.toLowerCase();
              if (suffix === 'k') val *= 1000;
              if (suffix === 'm') val *= 1000000;
              if (suffix === 'b') val *= 1000000000;
              if (!isNaN(val) && val > 0) {
                price = val;
                detectedCurrency = 'GOLD';
                break;
              }
            }
          }
        }
      }

      // Non-listing UI items won't have a valid price
      if (price <= 0) {
        return null;
      }

      // Generate deterministic unique external ID
      const externalId = `${seller}_${itemName.replace(/\s+/g, '_')}_${price}_${detectedCurrency.toLowerCase()}_${quantity}`.toLowerCase();

      return {
        externalId,
        itemName,
        quantity,
        seller,
        startingPrice: price,
        currentPrice: price,
        buyoutPrice,
        currency: detectedCurrency,
        rawLore: lore,
      };
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to parse individual item in AH GUI');
      return null;
    }
  }
}

export const auctionObserver = new AuctionObserver();
