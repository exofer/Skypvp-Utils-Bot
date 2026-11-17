import { auctionObserver, type DiscoveredAuctionListing } from '../mineflayer/observers/auction.js';
import { mineflayerManager } from '../mineflayer/client.js';

export interface AuctionProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  fetchListings(): Promise<DiscoveredAuctionListing[]>;
}

export class MineflayerAuctionProvider implements AuctionProvider {
  public readonly name = 'Mineflayer (/ah GUI)';

  public async isAvailable(): Promise<boolean> {
    return mineflayerManager.isConnected();
  }

  public async fetchListings(): Promise<DiscoveredAuctionListing[]> {
    if (!mineflayerManager.isConnected()) {
      return [];
    }
    return auctionObserver.scrapeAuctionHouse();
  }
}

export const activeAuctionProvider: AuctionProvider = new MineflayerAuctionProvider();
