import type { Bot } from 'mineflayer';
import nbt from 'prismarine-nbt';
import { stripColorCodes } from '../../utils/minecraft.js';
import { createLogger } from '../../utils/logger.js';
import { mineflayerManager } from '../client.js';

const log = createLogger('outpost-observer');

export type OutpostType = 'RESISTANCE' | 'DAMAGE' | 'LUCKYBLOCKS' | 'SOULS';

export interface RawOutpostItemData {
  outpostType: OutpostType;
  outpostName: string;
  slot: number;
  itemName: string;
  displayName: string;
  count: number;
  rawLore: string[];
  rawNbt: any;
  metadata?: any;
}

export interface ParsedOutpostState {
  type: OutpostType;
  name: string;
  status: 'AVAILABLE' | 'CAPTURING' | 'CAPTURED' | 'COOLDOWN';
  controllingTeam?: string;
  owner?: string;
  capturingPlayer?: string;
  captureProgress?: number; // e.g. 0 - 100
  cooldownRemaining?: string;
  cooldownEndsAt?: Date;
  location?: string;
  rawLore: string[];
  lastUpdated: Date;
}

export class OutpostObserver {
  private isScanning = false;

  /**
   * Run `/outposts` (or `./outposts`) in-game and parse the "Warzone Events" inventory GUI
   */
  public async scrapeOutposts(diagnosticMode?: boolean): Promise<ParsedOutpostState[]> {
    const isDiag = diagnosticMode !== undefined ? diagnosticMode : process.env.OUTPOST_DIAGNOSTIC === 'true';

    if (!mineflayerManager.isConnected()) {
      log.debug('Cannot scrape outposts: Mineflayer bot is not connected');
      return [];
    }

    const bot = mineflayerManager.getBot();
    if (!bot) return [];

    if (this.isScanning) {
      log.warn('Outpost scan already in progress, skipping overlapping run');
      return [];
    }

    this.isScanning = true;

    try {
      log.info('Opening Warzone Events inventory (/outposts) via Mineflayer bot');
      const results = await this.openAndParseWindow(bot, isDiag);
      log.info({ count: results.length }, 'Discovered outpost states from Warzone Events GUI');
      return results;
    } catch (err: any) {
      log.error({ err: err?.message }, 'Failed to parse Warzone Events outpost window');
      return [];
    } finally {
      this.isScanning = false;
    }
  }

  private openAndParseWindow(bot: Bot, diagnosticMode: boolean): Promise<ParsedOutpostState[]> {
    return new Promise((resolve, reject) => {
      let windowHandled = false;

      const timeout = setTimeout(() => {
        bot.removeListener('windowOpen', onWindow);
        reject(new Error('Timeout waiting for Warzone Events GUI window to open'));
      }, 10000);

      const onWindow = async (window: any) => {
        const title = stripColorCodes(window.title || '');
        const titleLower = title.toLowerCase();

        // Validate that this window is actually Warzone Events / Outposts
        if (!titleLower.includes('warzone') && !titleLower.includes('outpost') && !titleLower.includes('events')) {
          log.debug({ title }, 'Ignoring unrelated GUI window');
          return;
        }

        windowHandled = true;
        clearTimeout(timeout);
        bot.removeListener('windowOpen', onWindow);

        try {
          log.info({ title, slots: window.slots?.length }, 'Warzone Events GUI window captured');

          if (diagnosticMode) {
            log.info(`\n==================================================\nOUTPOST GUI DETECTED\nGUI TITLE: ${title || '[unavailable]'}\n==================================================`);
          }

          const rawListings = this.extractRawOutpostItems(window, title, diagnosticMode);
          const parsedStates: ParsedOutpostState[] = [];

          for (const raw of rawListings) {
            const parsed = this.parseOutpostItem(raw);
            parsedStates.push(parsed);
          }

          // Close window cleanly
          try {
            bot.closeWindow(window);
          } catch (_) {}

          resolve(parsedStates);
        } catch (err) {
          try {
            bot.closeWindow(window);
          } catch (_) {}
          reject(err);
        }
      };

      bot.on('windowOpen', onWindow);

      // Execute /outposts (the native Minecraft slash command on PikaNetwork)
      mineflayerManager.sendCommand('/outposts');

      // Fallback to ./outposts after 2500ms if not opened yet
      setTimeout(() => {
        if (!windowHandled && this.isScanning) {
          log.debug('Trying fallback command ./outposts');
          mineflayerManager.sendCommand('./outposts');
        }
      }, 2500);
    });
  }

  public extractRawOutpostItems(window: any, _title: string, diagnosticMode: boolean): RawOutpostItemData[] {
    const rawListings: RawOutpostItemData[] = [];
    const items = window.containerItems ? window.containerItems() : [];

    if (diagnosticMode) {
      log.info(`--- WINDOW INVENTORY DUMP (Total items: ${items.length}) ---`);
      for (const it of items) {
        if (!it) continue;
        const dName = it.customName ? stripColorCodes(it.customName) : it.displayName || it.name;
        log.info(`Slot ${it.slot}: ${it.name} (Count: ${it.count}) | Display: "${dName}"`);
      }
      log.info('--- END WINDOW DUMP ---');
    }

    for (const item of items) {
      if (!item) continue;

      const outpostInfo = this.identifyOutpostItem(item);
      if (!outpostInfo) continue;

      const customName = item.customName ? stripColorCodes(item.customName) : null;
      const displayName = customName || item.displayName || item.name;

      // Extract raw lore lines from prismarine-item customLore, simplified NBT, or raw NBT
      const rawLoreLines: any[] = [];
      if (Array.isArray(item.customLore)) {
        rawLoreLines.push(...item.customLore);
      } else if (item.nbt) {
        try {
          const simplified: any = nbt.simplify(item.nbt);
          const sLore = simplified?.display?.Lore || simplified?.display?.lore;
          if (Array.isArray(sLore)) {
            rawLoreLines.push(...sLore);
          }
        } catch (_) {}

        if (rawLoreLines.length === 0 && item.nbt.value?.display?.value?.Lore?.value?.value) {
          const lv = item.nbt.value.display.value.Lore.value.value;
          if (Array.isArray(lv)) {
            rawLoreLines.push(...lv);
          }
        }
      }

      const lore: string[] = [];
      for (const rawLine of rawLoreLines) {
        const text = stripColorCodes(rawLine);
        if (text) {
          lore.push(text);
        }
      }

      const rawData: RawOutpostItemData = {
        outpostType: outpostInfo.type,
        outpostName: outpostInfo.name,
        slot: item.slot ?? -1,
        itemName: item.name,
        displayName,
        count: item.count || 1,
        rawLore: lore,
        rawNbt: item.nbt ? nbt.simplify(item.nbt) : null,
        metadata: item.metadata,
      };

      if (diagnosticMode) {
        const loreStr = lore.length > 0 ? lore.map((l) => '  ' + l).join('\n') : '  [unavailable]';
        const metaStr = item.metadata !== undefined && item.metadata !== null ? JSON.stringify(item.metadata) : '[unavailable]';
        log.info(
          `\n--------------------------------------------------\nOUTPOST ITEM DETECTED\nOUTPOST: ${outpostInfo.name}\nITEM: ${item.name}\nSLOT: ${item.slot ?? '[unavailable]'}\nDISPLAY NAME: ${displayName || '[unavailable]'}\nRAW METADATA: ${metaStr}\nRAW LORE:\n${loreStr}\n--------------------------------------------------`
        );
      }

      rawListings.push(rawData);
    }

    if (diagnosticMode) {
      const foundTypes = new Set(rawListings.map((r) => r.outpostType));
      const allTypes: Array<{ type: OutpostType; name: string; item: string }> = [
        { type: 'RESISTANCE', name: 'Resistance', item: 'diamond_chestplate' },
        { type: 'DAMAGE', name: 'Damage', item: 'diamond_sword' },
        { type: 'LUCKYBLOCKS', name: 'Luckyblocks', item: 'tripwire_hook' },
        { type: 'SOULS', name: 'Souls', item: 'ink_sac' },
      ];
      for (const t of allTypes) {
        if (!foundTypes.has(t.type)) {
          log.warn(`OUTPOST ITEM MISSING: ${t.name} (expected ${t.item} not found in Warzone Events GUI)`);
        }
      }
    }

    return rawListings;
  }

  public identifyOutpostItem(item: any): { type: OutpostType; name: string } | null {
    if (!item) return null;
    const name = item.name.toLowerCase();

    // In prismarine-item, customName / nbt display.Name has the server-assigned name,
    // while item.displayName is the generic vanilla Minecraft item name (e.g. "Diamond Sword")
    let customName = item.customName ? stripColorCodes(item.customName).toLowerCase() : '';
    if (!customName && item.nbt) {
      try {
        const s: any = nbt.simplify(item.nbt);
        if (s?.display?.Name) {
          customName = stripColorCodes(s.display.Name).toLowerCase();
        }
      } catch (_) {}
    }

    const vanillaName = item.displayName ? stripColorCodes(item.displayName).toLowerCase() : '';
    const resolvedTitle = customName || vanillaName || name;

    // Ignore menu navigation / header items (e.g. Slot 0 "Warzone Events", "Switch Menus")
    if (
      resolvedTitle.includes('warzone events') ||
      resolvedTitle.includes('switch menus') ||
      resolvedTitle.includes('items menu') ||
      resolvedTitle.includes('koth') ||
      resolvedTitle.includes('stronghold') ||
      resolvedTitle.includes('duels') ||
      resolvedTitle.includes('flips') ||
      resolvedTitle.includes('bounty') ||
      resolvedTitle.includes('perks')
    ) {
      return null;
    }

    // 1. Diamond Chestplate -> Resistance
    if (name === 'diamond_chestplate' || resolvedTitle.includes('resistance')) {
      return { type: 'RESISTANCE', name: 'Resistance Outpost' };
    }

    // 2. Diamond Sword -> Damage (ensure it's not the Warzone Events header)
    if ((name === 'diamond_sword' && !resolvedTitle.includes('warzone')) || resolvedTitle.includes('damage')) {
      return { type: 'DAMAGE', name: 'Damage Outpost' };
    }

    // 3. Tripwire Hook -> Luckyblocks
    if (name === 'tripwire_hook' || resolvedTitle.includes('luckyblock')) {
      return { type: 'LUCKYBLOCKS', name: 'Luckyblocks Outpost' };
    }

    // 4. Ink Sac / Dye / Red Dye -> Souls
    if (
      name === 'ink_sac' ||
      name === 'ink_sack' ||
      name === 'red_dye' ||
      name === 'black_dye' ||
      name.includes('dye') ||
      name.includes('ink') ||
      resolvedTitle.includes('soul')
    ) {
      return { type: 'SOULS', name: 'Souls Outpost' };
    }

    return null;
  }

  public parseOutpostItem(raw: RawOutpostItemData): ParsedOutpostState {
    let status: 'AVAILABLE' | 'CAPTURING' | 'CAPTURED' | 'COOLDOWN' = 'AVAILABLE';
    let controllingTeam: string | undefined;
    let owner: string | undefined;
    let capturingPlayer: string | undefined;
    let captureProgress: number | undefined;
    let cooldownRemaining: string | undefined;
    let cooldownEndsAt: Date | undefined;
    let location: string | undefined;
    let explicitState: string | undefined;

    const lore = raw.rawLore;

    for (let i = 0; i < lore.length; i++) {
      const line = stripColorCodes(lore[i]);
      const lower = line.toLowerCase();

      // 1. PikaNetwork State line (e.g. "▪ State: CAPPED", "▪ State: CAPTURING", "▪ State: FREE")
      if (lower.includes('state:')) {
        if (lower.includes('capped') || lower.includes('captured') || lower.includes('controlled')) {
          explicitState = 'CAPPED';
          status = 'CAPTURED';
        } else if (lower.includes('capturing') || lower.includes('contested')) {
          explicitState = 'CAPTURING';
          status = 'CAPTURING';
        } else if (lower.includes('free') || lower.includes('available') || lower.includes('open')) {
          explicitState = 'FREE';
          status = 'AVAILABLE';
        } else if (lower.includes('cooldown')) {
          explicitState = 'COOLDOWN';
          status = 'COOLDOWN';
        }
      }

      // 2. PikaNetwork Location line (e.g. "▪ Location: x:-81 z:-81")
      if (lower.includes('location:')) {
        const locMatch = line.match(/location:\s*([xXyYzZ0-9\-:\s]+)/i);
        if (locMatch && locMatch[1]) {
          location = locMatch[1].trim();
        }
      }

      // 3. Capturing status & Capturing Player detection (MUST run before Capped by)
      // Handles: "▪ Being capped by: dreamylegend", "Capturing: PlayerName", "Capturing Player: PlayerName"
      if (
        lower.includes('being capped by:') ||
        lower.includes('capturing player:') ||
        lower.includes('capturing:') ||
        lower.includes('capper:')
      ) {
        const capperMatch = line.match(/(?:being capped by|capturing player|capturing|capper):?\s*(?:\[([^\]]+)\]|([a-zA-Z0-9_]{3,16}))/i);
        const extractedCapper = capperMatch?.[1] || capperMatch?.[2];
        if (
          extractedCapper &&
          !extractedCapper.toLowerCase().includes('nobody') &&
          !extractedCapper.toLowerCase().includes('none') &&
          !extractedCapper.toLowerCase().includes('progress')
        ) {
          capturingPlayer = extractedCapper;
        }
      }

      // 4. Controlling Team / Capped by detection (MUST NOT match "being capped by")
      // Handles: "▪ Capped by: Purge", "Controlling Team: [Purge]", "Controlled by: Purge", "Owner: Purge"
      if (
        (!lower.includes('being capped by') && lower.includes('capped by:')) ||
        lower.includes('controlling team:') ||
        lower.includes('controlled by:') ||
        lower.includes('owner:') ||
        lower.includes('holder:')
      ) {
        const teamMatch = line.match(/(?:(?:^|[^a-zA-Z])capped by|controlling team|controlled by|owner|holder):?\s*(?:\[([^\]]+)\]|([a-zA-Z0-9_]{3,16}))/i);
        const extracted = teamMatch?.[1] || teamMatch?.[2];
        if (
          extracted &&
          !extracted.toLowerCase().includes('nobody') &&
          !extracted.toLowerCase().includes('none') &&
          !extracted.toLowerCase().includes('neutral')
        ) {
          controllingTeam = extracted;
          owner = extracted;
          if (!explicitState) {
            status = 'CAPTURED';
          }
        }
      }

      // Check next line if team name is on the following line
      if (
        lower.trim() === 'controlling team:' ||
        lower.trim() === 'controlled by:' ||
        (!lower.includes('being') && lower.trim() === 'capped by:')
      ) {
        if (i + 1 < lore.length) {
          const nextLine = stripColorCodes(lore[i + 1]).trim();
          if (
            nextLine &&
            !nextLine.toLowerCase().includes('nobody') &&
            !nextLine.toLowerCase().includes('none') &&
            !nextLine.toLowerCase().includes('neutral')
          ) {
            const teamMatch = nextLine.match(/\[?([a-zA-Z0-9_]{3,16})\]?/);
            if (teamMatch && teamMatch[1]) {
              controllingTeam = teamMatch[1];
              owner = teamMatch[1];
              if (!explicitState) {
                status = 'CAPTURED';
              }
            }
          }
        }
      }

      // 5. Percentage / Progress detection (MUST match percentage or progress line, NOT generic % in rewards)
      if (
        (lower.includes('percentage:') || lower.includes('progress:') || lower.includes('capture progress:')) &&
        !lower.includes('rewards') &&
        !lower.includes('damage')
      ) {
        const progMatch = line.match(/([0-9.]+)\s*%/);
        if (progMatch && progMatch[1]) {
          captureProgress = parseFloat(progMatch[1]);
        }
      }

      // 6. Cooldown detection (e.g. "Cooldown: 12m 45s", "Cooldown: 500s")
      if (lower.includes('cooldown') || lower.includes('cooling down')) {
        const cdMatch = line.match(/(?:cooldown|cooling down):?\s*([0-9a-zA-Z\s]+)/i);
        if (cdMatch && cdMatch[1]) {
          const cdText = cdMatch[1].trim();
          if (!cdText.toLowerCase().includes('none') && !cdText.toLowerCase().includes('inactive')) {
            cooldownRemaining = cdText;
            status = 'COOLDOWN';

            let totalSeconds = 0;
            const minMatch = cdText.match(/(\d+)\s*m/i);
            const secMatch = cdText.match(/(\d+)\s*s/i);
            if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
            if (secMatch) totalSeconds += parseInt(secMatch[1], 10);
            if (totalSeconds > 0) {
              cooldownEndsAt = new Date(Date.now() + totalSeconds * 1000);
            }
          }
        }
      }

      // 7. Explicit legacy status lines (e.g. "Status: Available", "Status: Captured", "Status: Neutral")
      if (lower.startsWith('status:') && line.length > 8) {
        if (lower.includes('available') || lower.includes('neutral') || lower.includes('open')) {
          if (!controllingTeam) {
            status = 'AVAILABLE';
          }
        } else if (lower.includes('capturing') || lower.includes('contested')) {
          status = 'CAPTURING';
        } else if (lower.includes('cooldown')) {
          status = 'COOLDOWN';
        } else if (lower.includes('captured') || lower.includes('controlled')) {
          status = 'CAPTURED';
        }
      }
    }

    // Status resolution based on PikaNetwork mechanics:
    if (explicitState === 'CAPPED') {
      status = 'CAPTURED';
    } else if (explicitState === 'CAPTURING') {
      status = 'CAPTURING';
    } else if (explicitState === 'FREE') {
      status = (capturingPlayer && captureProgress && captureProgress > 0) ? 'CAPTURING' : 'AVAILABLE';
    } else if (!explicitState) {
      if (captureProgress !== undefined && captureProgress > 0 && captureProgress < 100) {
        status = 'CAPTURING';
      } else if (capturingPlayer) {
        status = 'CAPTURING';
      }
    }

    return {
      type: raw.outpostType,
      name: raw.outpostName,
      status,
      controllingTeam,
      owner,
      capturingPlayer,
      captureProgress,
      cooldownRemaining,
      cooldownEndsAt,
      location,
      rawLore: lore,
      lastUpdated: new Date(),
    };
  }
}

export const outpostObserver = new OutpostObserver();
