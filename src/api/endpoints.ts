import { PikaApiClient } from './client.js';
import { redis } from '../utils/redis.js';
import { env } from '../config/env.js';
import { CACHE_TTL } from '../config/constants.js';
import {
  ProfileSchema,
  PlayerLeaderboardSchema,
  FightSchema,
  GlobalLeaderboardResponseSchema,
  MoverSchema,
  type Profile,
  type PlayerLeaderboard,
  type Fight,
  type GlobalLeaderboardResponse,
  type Mover,
} from './types.js';
import { z } from 'zod';

export const apiClient = new PikaApiClient(env.PIKA_API_KEY, env.PIKA_API_BASE_URL, redis);

export async function getProfile(username: string): Promise<Profile> {
  return apiClient.get<Profile>(`/profile/${encodeURIComponent(username)}`, ProfileSchema, CACHE_TTL.PLAYER);
}

export async function getPlayerStats(
  username: string,
  interval: 'total' | 'monthly' | 'weekly' = 'total',
  mode = 'ALL_MODES'
): Promise<PlayerLeaderboard> {
  const query = `type=skypvp&interval=${interval}&mode=${mode}`;
  return apiClient.get<PlayerLeaderboard>(
    `/profile/${encodeURIComponent(username)}/leaderboard?${query}`,
    PlayerLeaderboardSchema,
    CACHE_TTL.PLAYER
  );
}

export async function getPlayerHistory(username: string): Promise<any> {
  return apiClient.get<any>(
    `/profile/${encodeURIComponent(username)}/history?type=skypvp`,
    undefined,
    CACHE_TTL.PLAYER
  );
}

export async function getLeaderboard(
  stat = 'kills',
  interval: 'total' | 'monthly' | 'weekly' = 'total',
  offset = 0,
  limit = 25
): Promise<GlobalLeaderboardResponse> {
  const query = `type=skypvp&stat=${encodeURIComponent(stat)}&interval=${interval}&offset=${offset}&limit=${limit}`;
  return apiClient.get<GlobalLeaderboardResponse>(
    `/leaderboards?${query}`,
    GlobalLeaderboardResponseSchema,
    CACHE_TTL.LEADERBOARD
  );
}

export async function getLeaderboardTotal(
  stat = 'kills',
  interval: 'total' | 'monthly' | 'weekly' = 'total'
): Promise<any> {
  const query = `type=skypvp&stat=${encodeURIComponent(stat)}&interval=${interval}`;
  return apiClient.get<any>(`/leaderboards/total?${query}`, undefined, CACHE_TTL.LEADERBOARD);
}

export async function getLeaderboardStats(): Promise<string[]> {
  const res = await apiClient.get<any>(`/leaderboards/stats?type=skypvp`, undefined, CACHE_TTL.LEADERBOARD * 5);
  return Array.isArray(res) ? res : [];
}

export async function getMovers(
  stat = 'common.kills',
  window: '1d' | '7d' = '1d',
  limit = 25
): Promise<Mover[]> {
  const query = `type=skypvp&stat=${encodeURIComponent(stat)}&window=${window}&limit=${limit}`;
  return apiClient.get<Mover[]>(
    `/leaderboards/movers?${query}`,
    z.array(MoverSchema),
    CACHE_TTL.LEADERBOARD
  );
}

export async function getFights(limit = 25): Promise<Fight[]> {
  return apiClient.get<Fight[]>(`/fights?mode=skypvp&limit=${limit}`, z.array(FightSchema), CACHE_TTL.FIGHTS);
}

export async function getFight(id: string): Promise<Fight> {
  return apiClient.get<Fight>(`/fights/${encodeURIComponent(id)}`, FightSchema, CACHE_TTL.FIGHTS);
}

export async function getPlayerFights(username: string, limit = 10): Promise<any> {
  return apiClient.get<any>(
    `/profile/${encodeURIComponent(username)}/fights?mode=skypvp&limit=${limit}`,
    undefined,
    CACHE_TTL.FIGHTS
  );
}

export async function getPlayerTeams(username: string): Promise<any[]> {
  return apiClient.get<any[]>(`/players/${encodeURIComponent(username)}/teams`, undefined, CACHE_TTL.PLAYER);
}

export async function getTeamsTop(limit = 25): Promise<any[]> {
  return apiClient.get<any[]>(`/teams/skypvp/top?limit=${limit}`, undefined, CACHE_TTL.LEADERBOARD);
}

export async function getTeam(entityId: string): Promise<any> {
  return apiClient.get<any>(`/teams/skypvp/${encodeURIComponent(entityId)}`, undefined, CACHE_TTL.LEADERBOARD);
}

export async function getEvents(limit = 10): Promise<any[]> {
  return apiClient.get<any[]>(`/events?limit=${limit}`, undefined, CACHE_TTL.EVENTS);
}

export async function getEvent(id: string): Promise<any> {
  return apiClient.get<any>(`/events/${encodeURIComponent(id)}`, undefined, CACHE_TTL.EVENTS);
}

export async function getPlayerEvents(username: string): Promise<any> {
  return apiClient.get<any>(`/profile/${encodeURIComponent(username)}/events`, undefined, CACHE_TTL.EVENTS);
}
