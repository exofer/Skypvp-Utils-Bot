import { describe, it, expect, vi } from 'vitest';
import { checkPermission, isOwner, isAdmin } from '../src/permissions/guard.js';
import { PermissionLevel } from '../src/permissions/levels.js';
import { PermissionFlagsBits } from 'discord.js';

describe('Permissions & Guard Middleware', () => {
  it('correctly verifies the configured bot owner Discord ID', () => {
    // env.DISCORD_OWNER_ID is set in the environment or mock
    const ownerId = process.env.DISCORD_OWNER_ID || '123456789012345678';
    expect(isOwner(ownerId)).toBe(true);
    expect(isOwner('wrong_user_id')).toBe(false);
  });

  it('correctly identifies guild members with Administrator permissions', () => {
    const adminMember = {
      permissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
      },
    } as any;

    const normalMember = {
      permissions: {
        has: vi.fn(() => false),
      },
    } as any;

    expect(isAdmin(adminMember)).toBe(true);
    expect(isAdmin(normalMember)).toBe(false);
  });

  it('rejects non-owner execution of owner commands', async () => {
    const mockInteraction = {
      user: { id: 'impostor_id' },
      commandName: 'ownerlogs',
      guildId: 'guild_123',
    } as any;

    const result = await checkPermission(mockInteraction, PermissionLevel.OWNER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('restricted to the bot owner');
  });

  it('allows owner to execute admin and public commands unconditionally', async () => {
    const ownerId = process.env.DISCORD_OWNER_ID || '123456789012345678';
    const mockInteraction = {
      user: { id: ownerId },
      commandName: 'setup',
      guildId: 'guild_123',
    } as any;

    const adminResult = await checkPermission(mockInteraction, PermissionLevel.ADMIN);
    expect(adminResult.allowed).toBe(true);

    const publicResult = await checkPermission(mockInteraction, PermissionLevel.PUBLIC);
    expect(publicResult.allowed).toBe(true);
  });
});
