import { mineflayerManager } from '../mineflayer/client.js';
import { stripColorCodes } from '../utils/minecraft.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('stronghold-provider');

export interface StrongholdState {
  active: boolean;
  capturingPlayer?: string;
  capturedBy?: string;
  captureProgress?: number;
  lastUpdate: Date;
}

export class StrongholdProvider {
  private state: StrongholdState = {
    active: false,
    lastUpdate: new Date(),
  };

  constructor() {
    this.listenToMinecraftChat();
  }

  private listenToMinecraftChat(): void {
    mineflayerManager.on('chatMessage', (raw: string) => {
      const clean = stripColorCodes(raw);

      if (clean.toLowerCase().includes('stronghold')) {
        if (clean.toLowerCase().includes('started') || clean.toLowerCase().includes('active') || clean.toLowerCase().includes('begun')) {
          log.info('Stronghold event started');
          this.state = {
            active: true,
            capturingPlayer: undefined,
            capturedBy: undefined,
            lastUpdate: new Date(),
          };
        } else if (clean.toLowerCase().includes('captured by') || clean.toLowerCase().includes('has captured')) {
          const match = clean.match(/(?:captured by|captured)\s+([a-zA-Z0-9_]{3,16})/i);
          const winner = match?.[1] || 'Unknown';
          log.info({ winner }, 'Stronghold captured');
          this.state = {
            active: false,
            capturingPlayer: undefined,
            capturedBy: winner,
            lastUpdate: new Date(),
          };
        }
      }
    });
  }

  public getState(): StrongholdState {
    return { ...this.state };
  }
}

export const strongholdProvider = new StrongholdProvider();
