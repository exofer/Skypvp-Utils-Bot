import { mineflayerManager } from '../mineflayer/client.js';
import { stripColorCodes } from '../utils/minecraft.js';

export type OutpostType = 'SOULS' | 'DAMAGE' | 'RESISTANCE' | 'LUCKYBLOCKS';

export interface OutpostInfo {
  type: OutpostType;
  name: string;
  status: 'AVAILABLE' | 'CAPTURING' | 'CAPTURED' | 'COOLDOWN';
  controllingTeam?: string;
  owner?: string;
  capturingPlayer?: string;
  cooldownEndsAt?: Date;
  lastUpdated: Date;
}

export class OutpostProvider {
  private outposts: Map<OutpostType, OutpostInfo> = new Map([
    [
      'SOULS',
      {
        type: 'SOULS',
        name: 'Souls Outpost',
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
      'RESISTANCE',
      {
        type: 'RESISTANCE',
        name: 'Resistance Outpost',
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
  ]);

  constructor() {
    this.listenToMinecraftChat();
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
          } else if (clean.toLowerCase().includes('capturing')) {
            const playerMatch = clean.match(/([a-zA-Z0-9_]{3,16})\s+(?:is capturing|is capping)/i);
            const player = playerMatch?.[1];
            this.outposts.set(type, {
              ...info,
              status: 'CAPTURING',
              capturingPlayer: player,
              lastUpdated: new Date(),
            });
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
