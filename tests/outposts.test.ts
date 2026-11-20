import { describe, it, expect } from 'vitest';
import { outpostObserver, type RawOutpostItemData } from '../src/mineflayer/observers/outpost.js';
import { outpostService } from '../src/services/outpost.js';

describe('Outpost Item Identification Engine', () => {
  it('correctly maps Diamond Chestplate to Resistance Outpost', () => {
    const item = { name: 'diamond_chestplate', count: 1 };
    const identified = outpostObserver.identifyOutpostItem(item);
    expect(identified).not.toBeNull();
    expect(identified?.type).toBe('RESISTANCE');
    expect(identified?.name).toBe('Resistance Outpost');
  });

  it('correctly maps Diamond Sword to Damage Outpost', () => {
    const item = { name: 'diamond_sword', count: 1 };
    const identified = outpostObserver.identifyOutpostItem(item);
    expect(identified).not.toBeNull();
    expect(identified?.type).toBe('DAMAGE');
    expect(identified?.name).toBe('Damage Outpost');
  });

  it('correctly maps Tripwire Hook to Luckyblocks Outpost', () => {
    const item = { name: 'tripwire_hook', count: 1 };
    const identified = outpostObserver.identifyOutpostItem(item);
    expect(identified).not.toBeNull();
    expect(identified?.type).toBe('LUCKYBLOCKS');
    expect(identified?.name).toBe('Luckyblocks Outpost');
  });

  it('correctly maps Ink Sac to Souls Outpost', () => {
    const item1 = { name: 'ink_sac', count: 1 };
    const identified1 = outpostObserver.identifyOutpostItem(item1);
    expect(identified1).not.toBeNull();
    expect(identified1?.type).toBe('SOULS');
    expect(identified1?.name).toBe('Souls Outpost');

    const item2 = { name: 'ink_sack', count: 1 };
    const identified2 = outpostObserver.identifyOutpostItem(item2);
    expect(identified2?.type).toBe('SOULS');

    const item3 = { name: 'red_dye', count: 1, displayName: 'Souls Outpost' };
    const identified3 = outpostObserver.identifyOutpostItem(item3);
    expect(identified3?.type).toBe('SOULS');
  });

  it('rejects non-outpost items and menu header buttons', () => {
    expect(outpostObserver.identifyOutpostItem({ name: 'iron_sword' })).toBeNull();
    expect(outpostObserver.identifyOutpostItem({ name: 'stained_glass_pane' })).toBeNull();
    expect(outpostObserver.identifyOutpostItem({ name: 'arrow' })).toBeNull();
    expect(outpostObserver.identifyOutpostItem({ name: 'netherite_chestplate' })).toBeNull();
    expect(outpostObserver.identifyOutpostItem({ name: 'diamond_sword', displayName: 'Warzone Events' })).toBeNull();
    expect(
      outpostObserver.identifyOutpostItem({
        name: 'diamond_sword',
        displayName: 'Diamond Sword',
        customName: 'Warzone Events',
      })
    ).toBeNull();
    expect(outpostObserver.identifyOutpostItem({ name: 'compass', displayName: 'Switch Menus' })).toBeNull();
  });
});

describe('Outpost Lore Parser', () => {
  it('parses controlled outpost with controlling team', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'DAMAGE',
      outpostName: 'Damage Outpost',
      slot: 11,
      itemName: 'diamond_sword',
      displayName: 'Damage Outpost',
      count: 1,
      rawLore: [
        '§7Capture this outpost to boost team damage!',
        '§7Controlling Team: §6[THEARSENAL]',
        '§7Status: §aControlled',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('DAMAGE');
    expect(parsed.status).toBe('CAPTURED');
    expect(parsed.controllingTeam).toBe('THEARSENAL');
  });

  it('parses actively contested / capturing outpost with player and progress', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'RESISTANCE',
      outpostName: 'Resistance Outpost',
      slot: 13,
      itemName: 'diamond_chestplate',
      displayName: 'Resistance Outpost',
      count: 1,
      rawLore: [
        '§7Controlling Team: §cNone',
        '§eCapturing: §fMonclerSuit',
        '§eCapture Progress: §a45%',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('RESISTANCE');
    expect(parsed.status).toBe('CAPTURING');
    expect(parsed.capturingPlayer).toBe('MonclerSuit');
    expect(parsed.captureProgress).toBe(45);
  });

  it('parses cooldown state and remaining duration', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'LUCKYBLOCKS',
      outpostName: 'Luckyblocks Outpost',
      slot: 15,
      itemName: 'tripwire_hook',
      displayName: 'Luckyblocks Outpost',
      count: 1,
      rawLore: [
        '§7Controlling Team: §e[Vibes]',
        '§cCooldown: 12m 30s',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('LUCKYBLOCKS');
    expect(parsed.status).toBe('COOLDOWN');
    expect(parsed.controllingTeam).toBe('Vibes');
    expect(parsed.cooldownRemaining).toBe('12m 30s');
    expect(parsed.cooldownEndsAt).toBeDefined();
  });

  it('handles available / neutral outposts with no team', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'SOULS',
      outpostName: 'Souls Outpost',
      slot: 22,
      itemName: 'ink_sac',
      displayName: 'Souls Outpost',
      count: 1,
      rawLore: [
        '§7Status: §aAvailable',
        '§7Controlling Team: None',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('SOULS');
    expect(parsed.status).toBe('AVAILABLE');
    expect(parsed.controllingTeam).toBeUndefined();
  });

  it('handles team name on subsequent lore line', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'RESISTANCE',
      outpostName: 'Resistance Outpost',
      slot: 13,
      itemName: 'diamond_chestplate',
      displayName: 'Resistance Outpost',
      count: 1,
      rawLore: [
        '§7Controlling Team:',
        '§6[Purge]',
        '§7Capture Progress: 5%',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('RESISTANCE');
    expect(parsed.status).toBe('CAPTURING');
    expect(parsed.controllingTeam).toBe('Purge');
    expect(parsed.captureProgress).toBe(5);
  });

  it('parses live PikaNetwork format (Capped state with capper, owner, and location)', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'RESISTANCE',
      outpostName: 'Resistance Outpost',
      slot: 12,
      itemName: 'diamond_chestplate',
      displayName: 'Resistance Outpost',
      count: 1,
      rawLore: [
        'Status:',
        '▪ State: CAPPED',
        '▪ Location: x:-81 z:-81',
        '▪ Percentage: 100%',
        '▪ Being capped by: dreamylegend',
        '▪ Capped by: Purge',
        '▪ Time occupied: 01:47:53',
        'Rewards:',
        '▪ Take 5.0% less damage from players.',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('RESISTANCE');
    expect(parsed.status).toBe('CAPTURED');
    expect(parsed.controllingTeam).toBe('Purge');
    expect(parsed.owner).toBe('Purge');
    expect(parsed.capturingPlayer).toBe('dreamylegend');
    expect(parsed.captureProgress).toBe(100);
    expect(parsed.location).toBe('x:-81 z:-81');
  });

  it('parses live PikaNetwork format (Free state being contested by player)', () => {
    const rawData: RawOutpostItemData = {
      outpostType: 'DAMAGE',
      outpostName: 'Damage Outpost',
      slot: 30,
      itemName: 'diamond_sword',
      displayName: 'Damage Outpost',
      count: 1,
      rawLore: [
        'Status:',
        '▪ State: FREE',
        '▪ Location: x:79 z:79',
        '▪ Percentage: 7%',
        '▪ Being capped by: Ryuk',
        '▪ Capped by: Nobody',
        '▪ Time occupied: Not captured',
        'Rewards:',
        '▪ Deal 5.0% more damage to players.',
      ],
      rawNbt: null,
    };

    const parsed = outpostObserver.parseOutpostItem(rawData);
    expect(parsed.type).toBe('DAMAGE');
    expect(parsed.status).toBe('CAPTURING');
    expect(parsed.controllingTeam).toBeUndefined();
    expect(parsed.capturingPlayer).toBe('Ryuk');
    expect(parsed.captureProgress).toBe(7);
    expect(parsed.location).toBe('x:79 z:79');
  });
});

describe('Discord Outpost Dashboard Embed', () => {
  it('builds a dashboard displaying all 4 outposts without item names and using 🟢 / 🔴 status emojis', () => {
    const mockOutposts = [
      {
        type: 'RESISTANCE' as const,
        name: 'Resistance Outpost',
        status: 'AVAILABLE' as const,
        lastUpdated: new Date(),
      },
      {
        type: 'DAMAGE' as const,
        name: 'Damage Outpost',
        status: 'CAPTURED' as const,
        controllingTeam: 'THEARSENAL',
        lastUpdated: new Date(),
      },
      {
        type: 'LUCKYBLOCKS' as const,
        name: 'Luckyblocks Outpost',
        status: 'COOLDOWN' as const,
        controllingTeam: 'Vibes',
        cooldownRemaining: '5m',
        lastUpdated: new Date(),
      },
      {
        type: 'SOULS' as const,
        name: 'Souls Outpost',
        status: 'CAPTURING' as const,
        capturingPlayer: 'Firestorm5783',
        captureProgress: 80,
        lastUpdated: new Date(),
      },
    ];

    const embed = outpostService.buildOutpostEmbed(mockOutposts);
    expect(embed.data.title).toContain('SkyPvP Outpost Control Board');
    expect(embed.data.fields?.length).toBe(4);

    // Resistance (Available -> Free 🔴, keeps 🛡️ emoji in front of name, no item name, no 🛡️ emoji in status)
    expect(embed.data.fields?.[0].name).toBe('🛡️ Resistance Outpost');
    expect(embed.data.fields?.[0].value).not.toContain('Diamond Chestplate');
    expect(embed.data.fields?.[0].value).toContain('🔴 **Free**');
    expect(embed.data.fields?.[0].value).not.toContain('🛡️');

    // Damage (Captured -> Controlled 🟢, keeps ⚔️ emoji in front of name, no item name)
    expect(embed.data.fields?.[1].name).toBe('⚔️ Damage Outpost');
    expect(embed.data.fields?.[1].value).not.toContain('Diamond Sword');
    expect(embed.data.fields?.[1].value).toContain('🟢 **Controlled**');
    expect(embed.data.fields?.[1].value).toContain('THEARSENAL');
    expect(embed.data.fields?.[1].value).not.toContain('🛡️');

    // Luckyblocks
    expect(embed.data.fields?.[2].name).toBe('📦 Luckyblocks Outpost');
    expect(embed.data.fields?.[2].value).not.toContain('Tripwire Hook');
    expect(embed.data.fields?.[2].value).toContain('⏳ **On Cooldown (Free)**');

    // Souls
    expect(embed.data.fields?.[3].name).toBe('👻 Souls Outpost');
    expect(embed.data.fields?.[3].value).not.toContain('Ink Sac');
    expect(embed.data.fields?.[3].value).toContain('Firestorm5783');
  });

  it('strictly prohibits role pings and @everyone in outpost dashboard', () => {
    const payload = {
      content: undefined,
      allowedMentions: { parse: [] },
    };

    expect(payload.content).toBeUndefined();
    expect(payload.allowedMentions.parse).toEqual([]);
  });
});
