import { z } from 'zod';

export const RankSchema = z.object({
  level: z.number().optional(),
  experience: z.number().optional(),
  percentage: z.number().optional(),
}).passthrough();

export const ServerRankSchema = z.object({
  name: z.string().optional(),
  displayName: z.string().optional(),
  server: z.string().optional(),
}).passthrough();

export const ProfileSchema = z.object({
  username: z.string(),
  lastSeen: z.number().optional(),
  rank: RankSchema.optional(),
  ranks: z.array(ServerRankSchema).optional().default([]),
  friends: z.array(z.any()).optional().default([]),
  guild: z.any().optional(),
  discord: z.any().optional(),
}).passthrough();

export type Profile = z.infer<typeof ProfileSchema>;

export const LeaderboardEntrySchema = z.object({
  place: z.number().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  id: z.string().optional(),
}).passthrough();

export const StatBlockSchema = z.object({
  metadata: z.object({
    total: z.number().optional(),
  }).optional(),
  entries: z.array(LeaderboardEntrySchema).nullable().optional(),
}).passthrough();

export const PlayerLeaderboardSchema = z.record(z.string(), StatBlockSchema);
export type PlayerLeaderboard = z.infer<typeof PlayerLeaderboardSchema>;

export const FightSideSchema = z.object({
  username: z.string().nullable().optional(),
  rank: z.string().nullable().optional(),
  kills: z.number().optional(),
  deaths: z.number().optional(),
  weapon: z.string().nullable().optional(),
  armour: z.array(z.any()).optional().default([]),
}).passthrough();

export const FightSchema = z.object({
  id: z.string(),
  time: z.number().optional(),
  mode: z.string().optional(),
  server: z.string().nullable().optional(),
  killType: z.string().optional(),
  duration: z.number().optional(),
  killer: FightSideSchema.optional(),
  victim: FightSideSchema.optional(),
}).passthrough();

export type Fight = z.infer<typeof FightSchema>;

export const GlobalLeaderboardResponseSchema = z.object({
  metadata: z.object({
    total: z.number().optional(),
  }).optional(),
  entries: z.array(
    z.object({
      place: z.number().optional(),
      value: z.union([z.string(), z.number()]).optional(),
      id: z.string().optional(),
      user: z.object({
        username: z.string().optional(),
      }).optional(),
    }).passthrough()
  ).optional().default([]),
}).passthrough();

export type GlobalLeaderboardResponse = z.infer<typeof GlobalLeaderboardResponseSchema>;

export const MoverSchema = z.object({
  username: z.string(),
  difference: z.number().optional(),
  current: z.number().optional(),
  previous: z.number().optional(),
}).passthrough();

export type Mover = z.infer<typeof MoverSchema>;
