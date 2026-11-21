import { mineflayerManager } from '../mineflayer/client.js';
import { stripColorCodes } from '../utils/minecraft.js';
import { outpostObserver, type OutpostType } from '../mineflayer/observers/outpost.js';
import { createLogger } from '../utils/logger.js';
import { prisma } from '../db/prisma.js';

const log = createLogger('outpost-provider');

export type { OutpostType };

export interface OutpostInfo {
  type: OutpostType;
  name: string;
  status: 'AVAILABLE' | 'CAPTURING' | 'CAPTURED' | 'COOLDOWN';
  controllingTeam?: string;
  owner?: string;
  capturingPlayer?: string;
  captureProgress?: number;
  cooldownRemaining?: string;
  cooldownEndsAt?: Date;
  location?: string;
  rawLore?: string[];
  lastUpdated: Date;
}

export class OutpostProvider {
  private outposts: Map<OutpostType, OutpostInfo> = new Map([
    [
      'RESISTANCE',
      {
        type: 'RESISTANCE',
        name: 'Resistance Outpost',
        status: 'AVAILABLE',
        lastUpdated: new Date(),
      },
    ],
    [
      'DAMAGE',
      {
        type: 'DAMAGE',
        name: 'Damage Outpost',
        status: 'AVAILABLE',
        lastUpdated: new Date(),
      },
    ],
    [
      'LUCKYBLOCKS',
      {
        type: 'LUCKYBLOCKS',
        name: 'Luckyblocks Outpost',
        status: 'AVAILABLE',
        lastUpdated: new Date(),
      },
    ],
    [
      'SOULS',
      {
        type: 'SOULS',
        name: 'Souls Outpost',
        status: 'AVAILABLE',
        lastUpdated: new Date(),
      },
    ],
  ]);

  private initializedFromDb = false;
  private lastScrapeFresh = false;

  constructor() {
    this.listenToMinecraftChat();
    this.initializeFromDatabase().catch((err) => {
      log.debug({ err: err?.message }, 'Deferred outpost database initialization');
    });
  }

  /**
   * Hydrate in-memory state from database records on startup so existing
   * outpost statuses are preserved rather than reset to default AVAILABLE
   */
  public async initializeFromDatabase(): Promise<void> {
    try {
      const records = await prisma.outpostRecord.findMany();
      if (records && records.length > 0) {
        for (const rec of records) {
          const type = rec.outpostName as OutpostType;
          const current = this.outposts.get(type);
          if (current) {
            this.outposts.set(type, {
              ...current,
              status: (rec.status as any) || current.status,
              controllingTeam: rec.controllingTeam ?? undefined,
              owner: rec.owner ?? undefined,
              capturingPlayer: rec.capturingPlayer ?? undefined,
              captureProgress: rec.captureProgress ?? undefined,
              cooldownEndsAt: rec.cooldownEndsAt ?? undefined,
              lastUpdated: rec.lastCheckedAt || current.lastUpdated,
            });
          }
        }
        this.initializedFromDb = true;
        log.info({ count: records.length }, 'Hydrated initial outpost states from database');
      }
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to hydrate outpost states from database');
    }
  }

  /**
   * Returns whether the most recent fetch obtained fresh scraped data from the server
   */
  public hasFreshData(): boolean {
    return this.lastScrapeFresh;
  }

  /**
   * Scrape and update live outposts via /outposts GUI in Mineflayer.
   * If Mineflayer is disconnected or scraping fails, preserves the last valid state.
   */
  public async fetchOutposts(diagnosticMode?: boolean): Promise<OutpostInfo[]> {
    if (!this.initializedFromDb) {
      await this.initializeFromDatabase();
    }

    if (!mineflayerManager.isConnected()) {
      this.lastScrapeFresh = false;
      return this.getOutposts();
    }

    try {
      const scraped = await outpostObserver.scrapeOutposts(diagnosticMode);
      if (scraped && scraped.length > 0) {
        for (const item of scraped) {
          const current = this.outposts.get(item.type);
          this.outposts.set(item.type, {
            type: item.type,
            name: item.name,
            status: item.status,
            controllingTeam: item.controllingTeam ?? current?.controllingTeam,
            owner: item.owner ?? current?.owner,
            capturingPlayer: item.capturingPlayer ?? current?.capturingPlayer,
            captureProgress: item.captureProgress ?? current?.captureProgress,
            cooldownRemaining: item.cooldownRemaining ?? current?.cooldownRemaining,
            cooldownEndsAt: item.cooldownEndsAt ?? current?.cooldownEndsAt,
            location: item.location ?? current?.location,
            rawLore: item.rawLore,
            lastUpdated: new Date(),
          });
        }
        this.lastScrapeFresh = true;
        return this.getOutposts();
      }
    } catch (err: any) {
      log.error({ err: err?.message }, 'Failed to fetch outposts via GUI scraper; retaining last valid state');
    }

    this.lastScrapeFresh = false;
    return this.getOutposts();
  }

  private listenToMinecraftChat(): void {
    mineflayerManager.on('chatMessage', (raw: string) => {
      const clean = stripColorCodes(raw);

      for (const [type, info] of this.outposts.entries()) {
        const keyword = type.toLowerCase();

        if (clean.toLowerCase().includes(keyword) && clean.toLowerCase().includes('outpost')) {
          if (clean.toLowerCase().includes('captured by') || clean.toLowerCase().includes('controlled by')) {
            const teamMatch = clean.match(/(?:team|guild|clan|by)\s+([a-zA-Z0-9_]{3,16})/i);
            const team = teamMatch?.[1] || 'Unknown';
            this.outposts.set(type, {
              ...info,
              status: 'CAPTURED',
              controllingTeam: team,
              capturingPlayer: undefined,
              lastUpdated: new Date(),
            });
            this.lastScrapeFresh = true;
          } else if (clean.toLowerCase().includes('started to claim') || clean.toLowerCase().includes('is claiming')) {
            const teamMatch = clean.match(/team\s+([a-zA-Z0-9_]{3,16})/i);
            const team = teamMatch?.[1];
            this.outposts.set(type, {
              ...info,
              status: 'CAPTURING',
              controllingTeam: team,
              lastUpdated: new Date(),
            });
            this.lastScrapeFresh = true;
          } else if (clean.toLowerCase().includes('capturing') || clean.toLowerCase().includes('is capping')) {
            const playerMatch = clean.match(/([a-zA-Z0-9_]{3,16})\s+(?:is capturing|is capping)/i);
            const player = playerMatch?.[1];
            this.outposts.set(type, {
              ...info,
              status: 'CAPTURING',
              capturingPlayer: player,
              lastUpdated: new Date(),
            });
            this.lastScrapeFresh = true;
          }
        }
      }
    });
  }

  public getOutposts(): OutpostInfo[] {
    return Array.from(this.outposts.values());
  }

  public getOutpost(type: OutpostType): OutpostInfo | undefined {
    return this.outposts.get(type);
  }
}

export const outpostProvider = new OutpostProvider();
