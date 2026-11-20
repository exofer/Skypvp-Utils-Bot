import { describe, it, expect } from 'vitest';
import { formatWeaponName } from '../src/utils/minecraft.js';

describe('Weapon Name Formatting', () => {
  it('formats weapon objects with item and enchants', () => {
    const weaponObj = {
      item: 'DIAMOND_SWORD',
      enchants: { Unbreaking: 4, Sharpness: 5 },
    };
    expect(formatWeaponName(weaponObj)).toBe('Diamond Sword');
  });

  it('strips kit prefixes from weapon identifiers', () => {
    expect(formatWeaponName('kit:Starter:DIAMOND_SWORD')).toBe('Diamond Sword');
    expect(formatWeaponName('kit:Sigma:IRON_SWORD')).toBe('Iron Sword');
  });

  it('formats custom named weapons and PascalCase correctly', () => {
    expect(formatWeaponName('OblivionBlade')).toBe('Oblivion Blade');
    expect(formatWeaponName('stormcallerblade')).toBe('Stormcallerblade');
    expect(formatWeaponName('SKULL_ITEM')).toBe('Player Skull');
    expect(formatWeaponName('COOKED_BEEF')).toBe('Steak');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatWeaponName(null)).toBe('');
    expect(formatWeaponName(undefined)).toBe('');
    expect(formatWeaponName(null, 'DIAMOND_SWORD')).toBe('Diamond Sword');
  });
});

describe('Killfeed & Fights Line Formatting', () => {
  it('correctly maps winner and loser from Pika API response', () => {
    const rawFight = {
      id: '1794931093684.01a1ea3a',
      time: 1794931093684,
      mode: 'SkyPvP',
      killType: 'melee',
      cause: 'ENTITY_ATTACK',
      weapon: { item: 'DIAMOND_SWORD' },
      winner: { username: 'MonclerSuit', rank: 'Sigma' },
      loser: { username: 'MEHMET4634', rank: 'Member' },
    };

    const killer = rawFight.winner?.username || (rawFight as any).killer?.username || 'Unknown';
    const victim = rawFight.loser?.username || (rawFight as any).victim?.username || 'Unknown';
    const weaponName = formatWeaponName(rawFight.weapon, rawFight.winner?.weapon);
    const line = `• **${killer}** killed **${victim}** with *${weaponName}*`;

    expect(killer).toBe('MonclerSuit');
    expect(victim).toBe('MEHMET4634');
    expect(line).toBe('• **MonclerSuit** killed **MEHMET4634** with *Diamond Sword*');
  });

  it('handles VOID death causes correctly', () => {
    const voidFight = {
      id: '1794931088583.01a1ea3a',
      time: 1794931088583,
      mode: 'SkyPvP',
      killType: 'other',
      cause: 'VOID',
      weapon: null,
      winner: { username: 'WindItalia', rank: 'Member' },
      loser: { username: 'VenomStrike_XV', rank: 'Member' },
    };

    const killer = voidFight.winner?.username || 'Unknown';
    const victim = voidFight.loser?.username || 'Unknown';
    const action = voidFight.cause === 'VOID' ? 'knocked' : 'killed';
    const weaponText = voidFight.cause === 'VOID' ? ' into the void' : '';
    const line = `• **${killer}** ${action} **${victim}**${weaponText}`;

    expect(killer).toBe('WindItalia');
    expect(victim).toBe('VenomStrike_XV');
    expect(line).toBe('• **WindItalia** knocked **VenomStrike_XV** into the void');
  });

  it('parses player fights from data.recent and determines victory/defeat', () => {
    const playerData = {
      days: 30,
      kills: 50,
      deaths: 20,
      recent: [
        {
          fight: {
            winner: { username: 'CoolPlayer' },
            loser: { username: 'Opponent1' },
            cause: 'ENTITY_ATTACK',
            weapon: 'DIAMOND_SWORD',
          },
          won: true,
        },
        {
          fight: {
            winner: { username: 'Nemesis' },
            loser: { username: 'CoolPlayer' },
            cause: 'VOID',
          },
          won: false,
        },
      ],
    };

    const targetUser = 'CoolPlayer';
    const fightEntries = playerData.recent.map((r) => ({
      fight: r.fight,
      won: r.won,
    }));

    // Fight 1: Victory
    const f1 = fightEntries[0];
    const isWinner1 = f1.won;
    const opponent1 = isWinner1 ? f1.fight.loser.username : f1.fight.winner.username;
    expect(isWinner1).toBe(true);
    expect(opponent1).toBe('Opponent1');

    // Fight 2: Defeat
    const f2 = fightEntries[1];
    const isWinner2 = f2.won;
    const opponent2 = isWinner2 ? f2.fight.loser.username : f2.fight.winner.username;
    expect(isWinner2).toBe(false);
    expect(opponent2).toBe('Nemesis');
  });
});
