import { prisma } from '../db/prisma.js';
import { getPlayerStats } from '../api/endpoints.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('player-service');

export interface StatDelta {
  stat: string;
  previous: number;
  current: number;
  diff: number;
}

export class PlayerService {
  /**
   * Add a player to a user's tracked player list
   */
  public async trackPlayer(userId: string, playerName: string) {
    // Ensure UserProfile exists
    const user = await prisma.userProfile.upsert({
      where: { discordId: userId },
      update: {},
      create: { discordId: userId },
    });

    // Check count limit
    const count = await prisma.trackedPlayer.count({ where: { userId: user.id } });
    if (count >= 10) {
      throw new Error('You have reached the limit of 10 tracked players.');
    }

    const tracked = await prisma.trackedPlayer.create({
      data: {
        userId: user.id,
        playerName: playerName.toLowerCase(),
      },
    });

    // Take initial snapshot
    await this.captureSnapshot(tracked.id, playerName);

    return tracked;
  }

  /**
   * Remove a player from user tracking
   */
  public async untrackPlayer(userId: string, playerName: string) {
    const user = await prisma.userProfile.findUnique({ where: { discordId: userId } });
    if (!user) throw new Error('User not found.');

    return prisma.trackedPlayer.deleteMany({
      where: {
        userId: user.id,
        playerName: playerName.toLowerCase(),
      },
    });
  }

  /**
   * List tracked players for a user
   */
  public async getTrackedPlayers(userId: string) {
    const user = await prisma.userProfile.findUnique({
      where: { discordId: userId },
      include: {
        trackedPlayers: {
          include: {
            snapshots: {
              orderBy: { snapshotAt: 'desc' },
              take: 2,
            },
          },
        },
      },
    });

    return user?.trackedPlayers ?? [];
  }

  /**
   * Fetch live stats and capture a database snapshot
   */
  public async captureSnapshot(trackedPlayerId: string, playerName: string) {
    try {
      const stats = await getPlayerStats(playerName, 'total');

      const kills = parseInt(String(stats['Kills']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const deaths = parseInt(String(stats['Deaths']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const wins = parseInt(String(stats['Wins']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const losses = parseInt(String(stats['Losses']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const highestStreak = parseInt(String(stats['Highest Killstreak']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const bounty = parseInt(String(stats['Bounty']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const arrowsShot = parseInt(String(stats['Arrows shot']?.entries?.[0]?.value ?? '0'), 10) || 0;
      const arrowsHit = parseInt(String(stats['Arrows hit']?.entries?.[0]?.value ?? '0'), 10) || 0;

      const snapshot = await prisma.playerSnapshot.create({
        data: {
          trackedPlayerId,
          playerName: playerName.toLowerCase(),
          kills,
          deaths,
          wins,
          losses,
          highestStreak,
          bounty,
          arrowsShot,
          arrowsHit,
          rawData: stats as any,
        },
      });

      return snapshot;
    } catch (err: any) {
      log.warn({ playerName, err: err?.message }, 'Failed to capture player snapshot');
      return null;
    }
  }

  /**
   * Compare the last two snapshots to compute stat deltas
   */
  public async getPlayerDeltas(trackedPlayerId: string): Promise<StatDelta[]> {
    const snapshots = await prisma.playerSnapshot.findMany({
      where: { trackedPlayerId },
      orderBy: { snapshotAt: 'desc' },
      take: 2,
    });

    if (snapshots.length < 2) return [];

    const [current, prev] = snapshots;
    if (!current || !prev) return [];

    const statsToCheck: Array<{ key: keyof typeof current; name: string }> = [
      { key: 'kills', name: 'Kills' },
      { key: 'deaths', name: 'Deaths' },
      { key: 'wins', name: 'Wins' },
      { key: 'losses', name: 'Losses' },
      { key: 'highestStreak', name: 'Highest Killstreak' },
      { key: 'bounty', name: 'Bounty' },
      { key: 'arrowsShot', name: 'Arrows Shot' },
      { key: 'arrowsHit', name: 'Arrows Hit' },
    ];

    const deltas: StatDelta[] = [];

    for (const stat of statsToCheck) {
      const currVal = (current[stat.key] as number) || 0;
      const prevVal = (prev[stat.key] as number) || 0;
      const diff = currVal - prevVal;
      if (diff !== 0) {
        deltas.push({
          stat: stat.name,
          previous: prevVal,
          current: currVal,
          diff,
        });
      }
    }

    return deltas;
  }
}

export const playerService = new PlayerService();
