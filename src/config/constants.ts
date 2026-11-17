// ============================================================
// SkyPvP Utils — Constants
// ============================================================

/** Embed color palette (hex values). */
export const COLORS = {
  INFO: 0x5865f2, // Discord blurple
  SUCCESS: 0x57f287, // Green
  ERROR: 0xed4245, // Red
  WARNING: 0xfee75c, // Yellow
  AUCTION: 0xe67e22, // Orange
  EVENT: 0x9b59b6, // Purple
  KOTH: 0xe91e63, // Pink
  STRONGHOLD: 0x1abc9c, // Teal
  OUTPOST: 0x3498db, // Blue
  CHAT: 0x95a5a6, // Grey
} as const;

/** Rate limiting configuration. */
export const RATE_LIMITS = {
  /** Maximum PikaNetwork API requests per minute. */
  PIKA_API_MAX_PER_MINUTE: 120,
  /** Target request rate to leave headroom. */
  PIKA_API_TARGET_PER_MINUTE: 70,
  /** Discord message rate limit (per channel, per 5s). */
  DISCORD_MESSAGES_PER_5S: 5,
  /** Max auction watches per user. */
  MAX_AUCTION_WATCHES_PER_USER: 25,
  /** Max tracked players per user. */
  MAX_TRACKED_PLAYERS_PER_USER: 10,
} as const;

/** Cache TTL values in seconds. */
export const CACHE_TTL = {
  /** Player profile/stats cache — 5 minutes. */
  PLAYER: 300,
  /** Leaderboard cache — 2 minutes. */
  LEADERBOARD: 120,
  /** Fights/killfeed cache — 1 minute. */
  FIGHTS: 60,
  /** Events cache — 30 seconds. */
  EVENTS: 30,
  /** General API response cache — 5 minutes. */
  API_DEFAULT: 300,
} as const;

/** Discord embed limits. */
export const EMBED_LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER_TEXT: 2048,
  AUTHOR_NAME: 256,
  FIELDS_COUNT: 25,
  TOTAL_CHARACTERS: 6000,
} as const;

/** Default polling intervals in milliseconds. */
export const POLLING_INTERVALS = {
  /** Player stat polling — 5 minutes. */
  PLAYER_STATS: 5 * 60 * 1000,
  /** Auction polling — 2 minutes. */
  AUCTION: 2 * 60 * 1000,
  /** Event monitoring — 30 seconds. */
  EVENTS: 30 * 1000,
  /** KOTH monitoring — 15 seconds. */
  KOTH: 15 * 1000,
  /** Stronghold monitoring — 15 seconds. */
  STRONGHOLD: 15 * 1000,
  /** Outpost monitoring — 30 seconds. */
  OUTPOST: 30 * 1000,
  /** Cleanup job — 1 hour. */
  CLEANUP: 60 * 60 * 1000,
} as const;

/** Application metadata. */
export const APP = {
  NAME: 'SkyPvP Utils',
  FOOTER: 'SkyPvP Utils • PikaNetwork',
  VERSION: '1.0.0',
} as const;
