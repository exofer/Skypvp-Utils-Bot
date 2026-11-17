import { describe, it, expect } from 'vitest';

describe('Auction Watch Matching Engine', () => {
  interface MockListing {
    itemName: string;
    currentPrice: number;
  }

  interface MockWatch {
    itemName: string;
    maxPrice?: number | null;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  }

  function matchesWatch(watch: MockWatch, listing: MockListing): boolean {
    if (watch.status !== 'ACTIVE') return false;
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
});
