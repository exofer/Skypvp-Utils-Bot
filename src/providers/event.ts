import { mineflayerManager } from '../mineflayer/client.js';
import { stripColorCodes } from '../utils/minecraft.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event-provider');

export type SkyPvPEventType =
  | 'FLORAL_FORTUNE'
  | 'ENVOY_DROPS'
  | 'BLOOD_LUST'
  | 'GOLD_RUSH'
  | 'HARD_POINT'
  | 'KOTL';

export interface SkyPvPEventState {
  type: SkyPvPEventType;
  name: string;
  active: boolean;
  startedAt?: Date;
  details?: string;
}

export class SkyPvPEventProvider {
  private events: Map<SkyPvPEventType, SkyPvPEventState> = new Map([
    ['FLORAL_FORTUNE', { type: 'FLORAL_FORTUNE', name: 'Floral Fortune', active: false }],
    ['ENVOY_DROPS', { type: 'ENVOY_DROPS', name: 'Envoy Drops', active: false }],
    ['BLOOD_LUST', { type: 'BLOOD_LUST', name: 'Blood Lust', active: false }],
    ['GOLD_RUSH', { type: 'GOLD_RUSH', name: 'Gold Rush', active: false }],
    ['HARD_POINT', { type: 'HARD_POINT', name: 'Hard Point', active: false }],
    ['KOTL', { type: 'KOTL', name: 'King of the Ladder (KOTL)', active: false }],
  ]);

  constructor() {
    this.listenToMinecraftChat();
  }

  private listenToMinecraftChat(): void {
    mineflayerManager.on('chatMessage', (raw: string) => {
      const clean = stripColorCodes(raw);

      // Match event announcements broadcast in server chat
      for (const [type, state] of this.events.entries()) {
        const eventNameLower = state.name.toLowerCase();

        if (
          clean.toLowerCase().includes(eventNameLower) &&
          (clean.toLowerCase().includes('started') || clean.toLowerCase().includes('begun') || clean.toLowerCase().includes('now active'))
        ) {
          log.info({ event: state.name }, 'Detected SkyPvP event start from in-game chat');
          this.events.set(type, {
            ...state,
            active: true,
            startedAt: new Date(),
            details: clean,
          });
        } else if (
          clean.toLowerCase().includes(eventNameLower) &&
          (clean.toLowerCase().includes('ended') || clean.toLowerCase().includes('finished') || clean.toLowerCase().includes('over'))
        ) {
          log.info({ event: state.name }, 'Detected SkyPvP event end from in-game chat');
          this.events.set(type, {
            ...state,
            active: false,
            details: clean,
          });
        }
      }
    });
  }

  public getEventStates(): SkyPvPEventState[] {
    return Array.from(this.events.values());
  }

  public getEventState(type: SkyPvPEventType): SkyPvPEventState | undefined {
    return this.events.get(type);
  }
}

export const eventProvider = new SkyPvPEventProvider();
