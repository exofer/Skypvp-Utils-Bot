/**
 * Permission levels for bot commands.
 *
 * - PUBLIC  — Available to all users when public commands are enabled.
 * - ADMIN   — Requires Discord Administrator permission in the guild.
 * - OWNER   — Restricted to the configured bot owner Discord ID.
 */
export enum PermissionLevel {
  PUBLIC = 'PUBLIC',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}

/** Metadata attached to every command for permission enforcement. */
export interface CommandPermissionMeta {
  /** The minimum permission level required to execute this command. */
  level: PermissionLevel;
  /** Human-readable description shown when access is denied. */
  description?: string;
}
