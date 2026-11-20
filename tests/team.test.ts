import { describe, it, expect } from 'vitest';
import { teamService } from '../src/services/team.js';
import type { TeamMember } from '../src/api/types.js';

describe('Team Service Utilities', () => {
  it('formats playtime duration into human-readable format', () => {
    expect(teamService.formatDuration(0)).toBe('0m');
    expect(teamService.formatDuration(59)).toBe('0m');
    expect(teamService.formatDuration(65)).toBe('1m');
    expect(teamService.formatDuration(3665)).toBe('1h 1m');
    expect(teamService.formatDuration(90061)).toBe('1d 1h 1m');
    expect(teamService.formatDuration(2363621)).toBe('27d 8h 33m');
  });

  it('correctly organizes team members into hierarchical roles', () => {
    const mockMembers: TeamMember[] = [
      { user: { username: 'SwEdSmoke' }, role: 'LEADER', active: true },
      { user: { username: 'Claimd' }, role: 'CO_LEADER', active: true },
      { user: { username: 'Clairiere' }, role: 'CO_LEADER', active: true },
      { user: { username: 'Tobirama' }, role: 'OFFICER', active: true },
      { user: { username: 'IAmGettingBanned' }, role: 'RECRUIT', active: true },
      { user: { username: 'Zovx' }, role: 'MEMBER', active: true },
    ];

    const roster = teamService.formatRoster(mockMembers);

    expect(roster.leaders).toEqual(['SwEdSmoke']);
    expect(roster.coLeaders).toEqual(['Claimd', 'Clairiere']);
    expect(roster.officers).toEqual(['Tobirama']);
    expect(roster.recruits).toEqual(['IAmGettingBanned', 'Zovx']);
  });

  it('handles empty or missing member lists gracefully', () => {
    const emptyRoster = teamService.formatRoster([]);
    expect(emptyRoster.leaders).toEqual([]);
    expect(emptyRoster.coLeaders).toEqual([]);
    expect(emptyRoster.officers).toEqual([]);
    expect(emptyRoster.recruits).toEqual([]);

    const undefinedRoster = teamService.formatRoster(undefined);
    expect(undefinedRoster.leaders).toEqual([]);
  });

  it('correctly extracts aggStats and members when embedded in team object', () => {
    const apiPayload = {
      place: 1,
      team: {
        gamemode: 'skypvp',
        family: 'teams',
        entityId: '651d686a-d650-45b9-9f8b-c5f170245f61',
        displayName: 'Purge',
        memberCount: 8,
        aggStats: {
          'common.kills': 11142,
          'common.deaths': 844,
          'outpost.captured': 391,
          'koth.wins': 29,
          'common.balance': 9073965,
          'onlinetime.played': 2441191,
        },
        members: [
          { user: { username: 'SwEdSmoke' }, role: 'LEADER', active: true },
        ],
      },
    };

    const team = apiPayload.team;
    const agg = team.aggStats || (apiPayload as any).aggStats || {};
    const members = team.members || (apiPayload as any).members || [];

    expect(agg['common.kills']).toBe(11142);
    expect(agg['common.deaths']).toBe(844);
    expect(agg['outpost.captured']).toBe(391);
    expect(agg['koth.wins']).toBe(29);
    expect(members.length).toBe(1);
    expect(members[0].user.username).toBe('SwEdSmoke');
  });
});
