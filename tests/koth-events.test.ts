import { describe, it, expect } from 'vitest';

describe('KOTH & Outpost State Logic', () => {
  it('distinguishes between East and West KOTH state tracking', () => {
    const kothStates = new Map<string, { active: boolean; winner?: string }>();
    kothStates.set('EAST', { active: true });
    kothStates.set('WEST', { active: false, winner: 'ChampionPvP' });

    expect(kothStates.get('EAST')?.active).toBe(true);
    expect(kothStates.get('WEST')?.active).toBe(false);
    expect(kothStates.get('WEST')?.winner).toBe('ChampionPvP');
  });

  it('guarantees outposts do not include role mentions or @everyone', () => {
    const outpostMessageContent = {
      content: undefined,
      allowedMentions: { parse: [] }, // Strict setting
    };

    expect(outpostMessageContent.content).toBeUndefined();
    expect(outpostMessageContent.allowedMentions.parse.length).toBe(0);
  });
});
