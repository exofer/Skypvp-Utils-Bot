import { describe, it, expect } from 'vitest';
import { stripColorCodes, sanitizeChat } from '../src/utils/minecraft.js';

describe('Minecraft Chat Bridge Filtering & Sanitization', () => {
  it('strips Minecraft color and formatting codes (§)', () => {
    const raw = '§6[SkyPvP] §ePlayer123§7: §aSelling Dragon Sword for §6$50,000!';
    const cleaned = stripColorCodes(raw);

    expect(cleaned).toBe('[SkyPvP] Player123: Selling Dragon Sword for $50,000!');
    expect(cleaned.includes('§')).toBe(false);
  });

  it('safely handles empty or null strings', () => {
    expect(stripColorCodes(null)).toBe('');
    expect(stripColorCodes(undefined)).toBe('');
    expect(stripColorCodes('')).toBe('');
  });

  it('truncates messages exceeding Discord 2000 character limits', () => {
    const hugeMessage = 'A'.repeat(2500);
    const sanitized = sanitizeChat(hugeMessage, 2000);

    expect(sanitized.length).toBeLessThanOrEqual(2000);
    expect(sanitized.endsWith('...')).toBe(true);
  });

  it('identifies and filters private message patterns', () => {
    const isPrivate = (clean: string) => {
      const lower = clean.toLowerCase();
      return (
        lower.startsWith('from ') ||
        lower.startsWith('to ') ||
        lower.includes('[party]') ||
        lower.includes('[guild]') ||
        lower.includes('[staff]') ||
        lower.includes('whispers:')
      );
    };

    expect(isPrivate('From StaffMember: Please respond')).toBe(true);
    expect(isPrivate('To SomePlayer: Hello there')).toBe(true);
    expect(isPrivate('[Party] Leader: Warp out now')).toBe(true);
    expect(isPrivate('[Guild] Member: GG on the fight')).toBe(true);
    expect(isPrivate('[SkyPvP] PlayerX: Looking for a team for KOTH')).toBe(false);
  });
});
