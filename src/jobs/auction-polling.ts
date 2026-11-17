import type { Job } from 'bullmq';
import { activeAuctionProvider } from '../providers/auction.js';
import { auctionService } from '../services/auction.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('job-auction-polling');

export async function processAuctionPolling(_job: Job): Promise<void> {
  const isAvailable = await activeAuctionProvider.isAvailable();
  if (!isAvailable) {
    log.debug('Skipping auction poll: Mineflayer is not currently connected');
    return;
  }

  log.info('Running auction polling job (/ah scraper)');

  try {
    const listings = await activeAuctionProvider.fetchListings();
    const newCount = await auctionService.processListings(listings);
    log.info({ totalScraped: listings.length, newCount }, 'Auction poll completed');
  } catch (err: any) {
    log.error({ err: err?.message }, 'Failed during auction polling job');
  }
}
