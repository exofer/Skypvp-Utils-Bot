import { EventEmitter } from 'node:events';
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
  upcoming?: boolean;
  startsInMinutes?: number;
  upcomingAlertSent?: boolean;
  alertedMinutes?: Set<number>;
}

export interface EventDefinition {
  type: SkyPvPEventType;
  name: string;
  keywords: string[];
}

export const EVENT_DEFINITIONS: Record<SkyPvPEventType, EventDefinition> = {
  FLORAL_FORTUNE: {
    type: 'FLORAL_FORTUNE',
    name: 'Floral Fortune',
    keywords: ['floral fortune'],
  },
  ENVOY_DROPS: {
    type: 'ENVOY_DROPS',
    name: 'Envoy Drops',
    keywords: ['envoy drops', 'envoy drop', 'envoy'],
  },
  BLOOD_LUST: {
    type: 'BLOOD_LUST',
    name: 'Blood Lust',
    keywords: ['blood lust', 'bloodlust'],
  },
  GOLD_RUSH: {
    type: 'GOLD_RUSH',
    name: 'Gold Rush',
    keywords: ['gold rush', 'goldrush'],
  },
  HARD_POINT: {
    type: 'HARD_POINT',
    name: 'Hard Point',
    keywords: ['hard point', 'hardpoint'],
  },
  KOTL: {
    type: 'KOTL',
    name: 'King of the Ladder (KoTL)',
    keywords: ['kotl', 'king of the ladder'],
  },
};

export class SkyPvPEventProvider extends EventEmitter {
  private events: Map<SkyPvPEventType, SkyPvPEventState> = new Map([
    ['FLORAL_FORTUNE', { type: 'FLORAL_FORTUNE', name: 'Floral Fortune', active: false }],
    ['ENVOY_DROPS', { type: 'ENVOY_DROPS', name: 'Envoy Drops', active: false }],
    ['BLOOD_LUST', { type: 'BLOOD_LUST', name: 'Blood Lust', active: false }],
    ['GOLD_RUSH', { type: 'GOLD_RUSH', name: 'Gold Rush', active: false }],
    ['HARD_POINT', { type: 'HARD_POINT', name: 'Hard Point', active: false }],
    ['KOTL', { type: 'KOTL', name: 'King of the Ladder (KoTL)', active: false }],
  ]);

  constructor() {
    super();
    this.listenToMinecraftChat();
  }

  private listenToMinecraftChat(): void {
    mineflayerManager.on('chatMessage', (raw: string) => {
      this.processChatMessage(raw);
    });
  }

  public processChatMessage(
    raw: string
  ): { type: SkyPvPEventType; action: 'upcoming' | 'started' | 'ended'; state: SkyPvPEventState } | null {
    const clean = stripColorCodes(raw).trim();
    if (!clean) return null;

    // Filter out player chat messages (which contain '›' separator)
    if (clean.includes('›')) {
      return null;
    }

    const lower = clean.toLowerCase();

    // Find which event this message is for
    let matchedType: SkyPvPEventType | null = null;
    for (const [type, def] of Object.entries(EVENT_DEFINITIONS) as [SkyPvPEventType, EventDefinition][]) {
      if (def.keywords.some((kw) => lower.includes(kw))) {
        matchedType = type;
        break;
      }
    }

    if (!matchedType) return null;
    const state = this.events.get(matchedType);
    if (!state) return null;

    // 1. Check for upcoming / early warning (e.g. "KoTL Game starts in 10 minutes!", "Floral Fortune Game starts in 5 minutes!")
    const preWarningMatch = clean.match(
      /(?:Game\s+starts\s+in|starts?\s+in|starting\s+in|begins?\s+in)\s+(\d+)\s+min(?:ute)?s?/i
    );
    if (preWarningMatch) {
      const minutes = parseInt(preWarningMatch[1], 10);
      // Alert for 10-minute and 5-minute pre-alerts (and <= 10 minutes)
      if (minutes <= 10 && !state.active) {
        if (!state.alertedMinutes) {
          state.alertedMinutes = new Set<number>();
        }
        if (!state.alertedMinutes.has(minutes)) {
          state.alertedMinutes.add(minutes);
          log.info({ event: state.name, minutes, clean }, 'Detected SkyPvP event early warning (pre-alert)');
          state.upcoming = true;
          state.startsInMinutes = minutes;
          state.upcomingAlertSent = false;
          state.details = clean;
          this.emit('eventUpcoming', state);
          return { type: matchedType, action: 'upcoming', state };
        }
      }
      return null;
    }

    // 2. Check for event start (e.g. "PikaEvents » Floral Fortune Event has started!", "KoTL Event has started!")
    if (
      lower.includes('started') ||
      lower.includes('has started') ||
      lower.includes('begun') ||
      lower.includes('has begun') ||
      lower.includes('now active')
    ) {
      if (state.active) {
        log.debug({ event: state.name }, 'Event is already active, ignoring duplicate start trigger');
        return null;
      }

      log.info({ event: state.name, clean }, 'Detected SkyPvP event start from in-game chat');
      state.active = true;
      state.upcoming = false;
      state.startedAt = new Date();
      state.details = clean;
      state.upcomingAlertSent = false;
      state.alertedMinutes?.clear();
      this.emit('eventStarted', state);
      return { type: matchedType, action: 'started', state };
    }

    // 3. Check for event end (e.g. "PikaEvents » The KoTL Event is over!")
    if (
      lower.includes('is over') ||
      lower.includes('ended') ||
      lower.includes('has ended') ||
      lower.includes('finished')
    ) {
      if (!state.active) {
        return null;
      }
      log.info({ event: state.name, clean }, 'Detected SkyPvP event end from in-game chat');
      state.active = false;
      state.upcoming = false;
      state.upcomingAlertSent = false;
      state.alertedMinutes?.clear();
      state.details = clean;
      this.emit('eventEnded', state);
      return { type: matchedType, action: 'ended', state };
    }

    return null;
  }

  public getEventStates(): SkyPvPEventState[] {
    return Array.from(this.events.values());
  }

  public getEventState(type: SkyPvPEventType): SkyPvPEventState | undefined {
    return this.events.get(type);
  }
}

export const eventProvider = new SkyPvPEventProvider();
