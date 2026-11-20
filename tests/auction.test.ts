import { describe, it, expect } from 'vitest';
import { stripColorCodes, extractPlainText } from '../src/utils/minecraft.js';
import { auctionObserver } from '../src/mineflayer/observers/auction.js';

describe('Auction Watch Matching Engine', () => {
  interface MockListing {
    itemName: string;
    currentPrice: number;
    currency?: 'MONEY' | 'GOLD';
  }

  interface MockWatch {
    itemName: string;
    maxPrice?: number | null;
    currency?: 'ANY' | 'MONEY' | 'GOLD';
    status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  }

  function matchesWatch(watch: MockWatch, listing: MockListing): boolean {
    if (watch.status !== 'ACTIVE') return false;

    // Check currency match
    if (watch.currency && watch.currency !== 'ANY') {
      const listingCurrency = listing.currency || 'MONEY';
      if (watch.currency.toUpperCase() !== listingCurrency.toUpperCase()) {
        return false;
      }
    }

    const nameMatch = listing.itemName.toLowerCase().includes(watch.itemName.toLowerCase());
    if (!nameMatch) return false;
    if (watch.maxPrice !== null && watch.maxPrice !== undefined && listing.currentPrice > watch.maxPrice) {
      return false;
    }
    return true;
  }

  it('matches listing when name matches and price is within threshold', () => {
    const watch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 100000, status: 'ACTIVE' };
    const listing: MockListing = { itemName: 'Dragon Sword Level 5', currentPrice: 85000 };

    expect(matchesWatch(watch, listing)).toBe(true);
  });

  it('rejects listing when price exceeds maxPrice threshold', () => {
    const watch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 50000, status: 'ACTIVE' };
    const listing: MockListing = { itemName: 'Dragon Sword Level 5', currentPrice: 85000 };

    expect(matchesWatch(watch, listing)).toBe(false);
  });

  it('ignores listings when watch is paused or deleted', () => {
    const pausedWatch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 100000, status: 'PAUSED' };
    const deletedWatch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 100000, status: 'DELETED' };
    const listing: MockListing = { itemName: 'Dragon Sword', currentPrice: 50000 };

    expect(matchesWatch(pausedWatch, listing)).toBe(false);
    expect(matchesWatch(deletedWatch, listing)).toBe(false);
  });

  it('matches case-insensitively with partial item name matches', () => {
    const watch: MockWatch = { itemName: 'helm', maxPrice: null, status: 'ACTIVE' };
    const listing: MockListing = { itemName: 'Diamond Helmet of Protection', currentPrice: 20000 };

    expect(matchesWatch(watch, listing)).toBe(true);
  });

  it('filters by currency: respects GOLD vs MONEY vs ANY', () => {
    const goldWatch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 500, currency: 'GOLD', status: 'ACTIVE' };
    const moneyWatch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 100000, currency: 'MONEY', status: 'ACTIVE' };
    const anyWatch: MockWatch = { itemName: 'Dragon Sword', maxPrice: 50000, currency: 'ANY', status: 'ACTIVE' };

    const goldListing: MockListing = { itemName: 'Dragon Sword', currentPrice: 350, currency: 'GOLD' };
    const moneyListing: MockListing = { itemName: 'Dragon Sword', currentPrice: 25000, currency: 'MONEY' };

    // Gold watch matches gold listing, rejects money listing
    expect(matchesWatch(goldWatch, goldListing)).toBe(true);
    expect(matchesWatch(goldWatch, moneyListing)).toBe(false);

    // Money watch matches money listing, rejects gold listing
    expect(matchesWatch(moneyWatch, moneyListing)).toBe(true);
    expect(matchesWatch(moneyWatch, goldListing)).toBe(false);

    // Any watch matches both when within price limit
    expect(matchesWatch(anyWatch, goldListing)).toBe(true);
    expect(matchesWatch(anyWatch, moneyListing)).toBe(true);
  });
});

describe('Auction GUI & NBT Parsing Robustness', () => {
  it('safely extracts text from NBT compound objects without throwing input.replace error', () => {
    const windowTitleObj = { type: 'string', value: 'Auction (1/7)' };
    const stripped = stripColorCodes(windowTitleObj);
    expect(stripped).toBe('Auction (1/7)');
  });

  it('extracts plain text from chat components with extra array', () => {
    const jsonChat = JSON.stringify({
      extra: [
        { color: 'gray', text: 'Seller: ' },
        { color: 'white', text: 'Firestorm5783' },
      ],
      text: '',
    });

    expect(extractPlainText(jsonChat)).toBe('Seller: Firestorm5783');
    expect(stripColorCodes(jsonChat)).toBe('Seller: Firestorm5783');
  });

  it('parses valid auction items with customLore', () => {
    const mockItem = {
      slot: 12,
      name: 'diamond_sword',
      displayName: 'Diamond Sword',
      count: 1,
      customLore: [
        '§7Seller: §fFirestorm5783',
        '§7Price: §6$90,000',
        '§eClick to buy!',
      ],
    };

    const parsed = auctionObserver.parseAuctionItem(mockItem);
    expect(parsed).not.toBeNull();
    expect(parsed?.seller).toBe('Firestorm5783');
    expect(parsed?.currentPrice).toBe(90000);
    expect(parsed?.itemName).toBe('Diamond Sword');
  });

  it('parses auction items with price abbreviations (90k, 2.5m)', () => {
    const mockItemK = {
      slot: 5,
      name: 'ender_pearl',
      displayName: 'Ender Pearl',
      count: 16,
      customLore: [
        '§7Sold by: §aCoolTrader',
        '§7Price: §e90k',
      ],
    };

    const parsedK = auctionObserver.parseAuctionItem(mockItemK);
    expect(parsedK).not.toBeNull();
    expect(parsedK?.seller).toBe('CoolTrader');
    expect(parsedK?.currentPrice).toBe(90000);

    const mockItemM = {
      slot: 6,
      name: 'netherite_sword',
      displayName: 'God Sword',
      count: 1,
      customLore: [
        '§7Seller: §bRichPlayer',
        '§7Price: §6$2.5m',
      ],
    };

    const parsedM = auctionObserver.parseAuctionItem(mockItemM);
    expect(parsedM).not.toBeNull();
    expect(parsedM?.currentPrice).toBe(2500000);
  });

  it('ignores bottom row control slots (>= 45) and items without a price', () => {
    const mockBottomItem = {
      slot: 49,
      name: 'compass',
      displayName: 'Search Filter',
      customLore: ['§7Click to search'],
    };

    expect(auctionObserver.parseAuctionItem(mockBottomItem)).toBeNull();

    const mockGlassPane = {
      slot: 0,
      name: 'stained_glass_pane',
      displayName: ' ',
      customLore: [],
    };

    expect(auctionObserver.parseAuctionItem(mockGlassPane)).toBeNull();
  });

  it('detects Gold currency in auction items (Price: 500 Gold, 500g, ⛃)', () => {
    const goldItem = {
      slot: 10,
      name: 'diamond_axe',
      displayName: 'Battle Axe',
      count: 1,
      customLore: [
        '§7Seller: §fGoldTrader',
        '§7Price: §6500 Gold',
        '§7Buyout: §6750 Gold',
      ],
    };

    const parsed = auctionObserver.parseAuctionItem(goldItem);
    expect(parsed).not.toBeNull();
    expect(parsed?.currency).toBe('GOLD');
    expect(parsed?.currentPrice).toBe(500);
    expect(parsed?.buyoutPrice).toBe(750);
    expect(parsed?.seller).toBe('GoldTrader');

    // Test with coin glyph ⛃
    const glyphItem = {
      slot: 11,
      name: 'netherite_boots',
      displayName: 'Speed Boots',
      count: 1,
      customLore: [
        '§7Seller: §eRichKid',
        '§7Price: ⛃ 1,200',
      ],
    };

    const parsedGlyph = auctionObserver.parseAuctionItem(glyphItem);
    expect(parsedGlyph).not.toBeNull();
    expect(parsedGlyph?.currency).toBe('GOLD');
    expect(parsedGlyph?.currentPrice).toBe(1200);

    // Test with explicit Currency: Gold line
    const explicitItem = {
      slot: 14,
      name: 'elytra',
      displayName: 'Wings',
      count: 1,
      customLore: [
        '§7Seller: §aPilot',
        '§7Currency: §6Gold',
        '§7Price: 250',
      ],
    };

    const parsedExplicit = auctionObserver.parseAuctionItem(explicitItem);
    expect(parsedExplicit).not.toBeNull();
    expect(parsedExplicit?.currency).toBe('GOLD');
    expect(parsedExplicit?.currentPrice).toBe(250);
  });

  it('does not confuse items named Gold or with gold in lore as Gold currency when priced in $', () => {
    const goldArmorItem = {
      slot: 15,
      name: 'golden_chestplate',
      displayName: 'Golden Chestplate of Titans',
      count: 1,
      customLore: [
        '§7A magnificent chestplate forged from',
        '§7pure gold and ancient magic.',
        '§7Seller: §bArmorSmith',
        '§7Price: §a$25,000',
      ],
    };

    const parsed = auctionObserver.parseAuctionItem(goldArmorItem);
    expect(parsed).not.toBeNull();
    expect(parsed?.currency).toBe('MONEY');
    expect(parsed?.currentPrice).toBe(25000);
    expect(parsed?.seller).toBe('ArmorSmith');
  });
});
