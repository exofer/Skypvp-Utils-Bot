import { getTeamsTop, getTeam, getPlayerTeams } from '../api/endpoints.js';
import type { TeamTopEntry, TeamDetails, TeamMember } from '../api/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('team-service');

export class TeamService {
  /**
   * Fetch paginated SkyPvP teams leaderboard
   */
  public async getLeaderboard(
    page = 1,
    pageSize = 10
  ): Promise<{ entries: TeamTopEntry[]; page: number; pageSize: number; totalPages: number }> {
    const safePage = Math.max(1, Math.min(page, 10));
    const offset = (safePage - 1) * pageSize;
    const entries = await getTeamsTop(pageSize, offset);

    return {
      entries: Array.isArray(entries) ? entries : [],
      page: safePage,
      pageSize,
      totalPages: 10, // Top 100 teams supported across 10 pages
    };
  }

  /**
   * Find a team by its name, UUID, or member's player name
   */
  public async findTeam(query: string): Promise<TeamDetails | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    // 1. Check if input is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(trimmed)) {
      try {
        const direct = await getTeam(trimmed);
        if (direct && direct.team) return direct;
      } catch (err: any) {
        log.debug({ query: trimmed, err: err?.message }, 'Direct UUID lookup failed');
      }
    }

    // 2. Fetch top teams to check for exact and partial name matches
    try {
      const topTeams: TeamTopEntry[] = await getTeamsTop(100, 0);
      if (Array.isArray(topTeams)) {
        // 2a. Exact match (case-insensitive)
        const exact = topTeams.find(
          (t) => t.displayName && t.displayName.toLowerCase() === trimmed.toLowerCase()
        );
        if (exact && exact.entityId) {
          const details: TeamDetails = await getTeam(exact.entityId);
          if (details) {
            if (!details.place && exact.place) details.place = exact.place;
            return details;
          }
        }

        // 2b. Partial / substring match (case-insensitive)
        const partial = topTeams.find(
          (t) => t.displayName && t.displayName.toLowerCase().includes(trimmed.toLowerCase())
        );
        if (partial && partial.entityId) {
          const details: TeamDetails = await getTeam(partial.entityId);
          if (details) {
            if (!details.place && partial.place) details.place = partial.place;
            return details;
          }
        }
      }
    } catch (err: any) {
      log.warn({ query: trimmed, err: err?.message }, 'Failed during top teams search');
    }

    // 3. Check if query matches a player username via /players/{username}/teams
    try {
      const playerTeams = await getPlayerTeams(trimmed);
      if (Array.isArray(playerTeams)) {
        const skypvpTeam = playerTeams.find((pt) => pt.gamemode === 'skypvp' && pt.entityId);
        if (skypvpTeam) {
          const details: TeamDetails = await getTeam(skypvpTeam.entityId);
          if (details) return details;
        }
      }
    } catch (err: any) {
      log.debug({ query: trimmed, err: err?.message }, 'Player teams lookup not found');
    }

    return null;
  }

  /**
   * Format duration in seconds into a human-readable string (e.g. 12d 4h 30m)
   */
  public formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
    return parts.join(' ');
  }

  /**
   * Group and format team roster members by role
   */
  public formatRoster(members?: TeamMember[]): {
    leaders: string[];
    coLeaders: string[];
    officers: string[];
    recruits: string[];
  } {
    const res = {
      leaders: [] as string[],
      coLeaders: [] as string[],
      officers: [] as string[],
      recruits: [] as string[],
    };

    if (!Array.isArray(members) || members.length === 0) {
      return res;
    }

    for (const m of members) {
      const name = m.user?.username || 'Unknown';
      const role = (m.role || '').toUpperCase();

      if (role === 'LEADER' || role === 'OWNER') {
        res.leaders.push(name);
      } else if (role === 'CO_LEADER' || role === 'COLEADER') {
        res.coLeaders.push(name);
      } else if (role === 'OFFICER' || role === 'MOD' || role === 'MODERATOR') {
        res.officers.push(name);
      } else {
        res.recruits.push(name);
      }
    }

    return res;
  }
}

export const teamService = new TeamService();
