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

  it('enforces individual public command availability restrictions for normal users', async () => {
    const { systemService } = await import('../src/services/system.js');
    const normalUserId = 'normal_user_999';
    const mockInteraction = {
      user: { id: normalUserId },
      commandName: 'auction',
      guildId: 'guild_123',
      member: { permissions: { has: () => false } },
    } as any;

    // By default, auction should be allowed
    const initialCheck = await checkPermission(mockInteraction, PermissionLevel.PUBLIC);
    expect(initialCheck.allowed).toBe(true);

    // Disable auction command globally
    await systemService.setCommandAvailability('auction', false);
    const disabledCheck = await checkPermission(mockInteraction, PermissionLevel.PUBLIC);
    expect(disabledCheck.allowed).toBe(false);
    expect(disabledCheck.reason).toContain('/auction');

    // Other commands remain accessible
    const otherInteraction = {
      user: { id: normalUserId },
      commandName: 'stats',
      guildId: 'guild_123',
      member: { permissions: { has: () => false } },
    } as any;
    const statsCheck = await checkPermission(otherInteraction, PermissionLevel.PUBLIC);
    expect(statsCheck.allowed).toBe(true);

    // Re-enable auction command
    await systemService.setCommandAvailability('auction', true);
    const reEnabledCheck = await checkPermission(mockInteraction, PermissionLevel.PUBLIC);
    expect(reEnabledCheck.allowed).toBe(true);
  });

  it('supports multiple bot owners dynamically and through configuration', async () => {
    const { systemService } = await import('../src/services/system.js');
    const coOwnerId = '987654321098765432';

    // Initially not an owner
    expect(isOwner(coOwnerId)).toBe(false);

    // Add co-owner
    await systemService.addOwner(coOwnerId);
    expect(isOwner(coOwnerId)).toBe(true);

    const mockCoOwnerInteraction = {
      user: { id: coOwnerId },
      commandName: 'ownerlogs',
      guildId: 'guild_123',
    } as any;

    const ownerResult = await checkPermission(mockCoOwnerInteraction, PermissionLevel.OWNER);
    expect(ownerResult.allowed).toBe(true);

    // Remove co-owner
    await systemService.removeOwner(coOwnerId);
    expect(isOwner(coOwnerId)).toBe(false);

    // Primary owner cannot be removed dynamically
    const primaryOwnerId = systemService.getConfiguredOwners()[0];
    if (primaryOwnerId) {
      const removed = await systemService.removeOwner(primaryOwnerId);
      expect(removed).toBe(false);
      expect(isOwner(primaryOwnerId)).toBe(true);
    }
  });
});
