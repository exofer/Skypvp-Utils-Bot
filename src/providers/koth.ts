import { mineflayerManager } from '../mineflayer/client.js';
import { stripColorCodes } from '../utils/minecraft.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('koth-provider');

export type KothLocationType = 'EAST' | 'WEST';

export interface KothState {
  location: KothLocationType;
  name: string;
  active: boolean;
  capturingPlayer?: string;
  capturedBy?: string;
  lastUpdate: Date;
}

export class KothProvider {
  private states: Map<KothLocationType, KothState> = new Map([
    [
      'EAST',
      {
        location: 'EAST',
        name: 'East KOTH',
        active: false,
        lastUpdate: new Date(),
      },
    ],
    [
      'WEST',
      {
        location: 'WEST',
        name: 'West KOTH',
        active: false,
        lastUpdate: new Date(),
      },
    ],
  ]);

  constructor() {
    this.listenToMinecraftChat();
  }

  private listenToMinecraftChat(): void {
    mineflayerManager.on('chatMessage', (raw: string) => {
      const clean = stripColorCodes(raw);

      for (const [loc, state] of this.states.entries()) {
        const keyword = loc === 'EAST' ? 'east koth' : 'west koth';

        if (clean.toLowerCase().includes(keyword)) {
          // Started / Active
          if (clean.toLowerCase().includes('started') || clean.toLowerCase().includes('active') || clean.toLowerCase().includes('has begun')) {
            log.info({ loc }, 'KOTH event started');
            this.states.set(loc, {
              ...state,
              active: true,
              capturingPlayer: undefined,
              capturedBy: undefined,
              lastUpdate: new Date(),
            });
          }
          // Captured
          else if (clean.toLowerCase().includes('captured by') || clean.toLowerCase().includes('has been captured')) {
            const playerMatch = clean.match(/(?:captured by|captured)\s+([a-zA-Z0-9_]{3,16})/i);
            const winner = playerMatch?.[1] || 'Unknown';
            log.info({ loc, winner }, 'KOTH captured');
            this.states.set(loc, {
              ...state,
              active: false,
              capturingPlayer: undefined,
              capturedBy: winner,
              lastUpdate: new Date(),
            });
          }
          // Capturing in progress
          else if (clean.toLowerCase().includes('is capping') || clean.toLowerCase().includes('is capturing')) {
            const playerMatch = clean.match(/([a-zA-Z0-9_]{3,16})\s+(?:is capping|is capturing)/i);
            const player = playerMatch?.[1];
            if (player) {
              this.states.set(loc, {
                ...state,
                active: true,
                capturingPlayer: player,
                lastUpdate: new Date(),
              });
            }
          }
        }
      }
    });
  }

  public getStates(): KothState[] {
    return Array.from(this.states.values());
  }

  public getState(loc: KothLocationType): KothState | undefined {
    return this.states.get(loc);
  }
}

export const kothProvider = new KothProvider();
