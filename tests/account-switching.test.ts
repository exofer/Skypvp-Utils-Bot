import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock mineflayer before importing client
vi.mock('mineflayer', () => {
  return {
    default: {
      createBot: vi.fn(() => {
        const bot = new EventEmitter() as any;
        bot._client = new EventEmitter();
        bot._client.socket = new EventEmitter();
        bot.quit = vi.fn();
        bot.chat = vi.fn();
        bot.inventory = { items: () => [] };
        bot.scoreboards = {};
        return bot;
      }),
    },
  };
});

describe('Account Switching & Credential Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('manualReconnect preserves autoReconnectEnabled instead of disabling it', async () => {
    const { MineflayerManager } = await import('../src/mineflayer/client.js');
    const manager = new MineflayerManager();

    // Start first connection (do not await spawn since mock bot doesn't auto-emit spawn)
    const firstPromise = manager.connect('FirstAccount', 'pass1', true);
    expect(manager.getStatus().username).toBe('FirstAccount');
    expect(manager.getStatus().autoReconnectPaused).toBe(false);

    // Switch to second account via manualReconnect
    const secondPromise = manager.manualReconnect('SecondAccount', 'pass2');

    // First promise should resolve cleanly to false rather than hanging
    expect(await firstPromise).toBe(false);

    const status = manager.getStatus();
    expect(status.username).toBe('SecondAccount');
    expect(status.autoReconnectPaused).toBe(false);
    expect(status.circuitBreakerTripped).toBe(false);
    expect(status.reconnectAttempts).toBe(0);

    // Clean up second connection
    manager.disconnect(true);
    expect(await secondPromise).toBe(false);
    expect(manager.getStatus().username).toBeNull();
  });

  it('connect resets stale disconnect reasons from previous account', async () => {
    const { MineflayerManager } = await import('../src/mineflayer/client.js');
    const manager = new MineflayerManager();

    const p1 = manager.connect('OldAccount', 'oldpass', true);
    const bot1 = manager.getBot() as any;
    bot1.emit('kicked', { text: 'Old account kick reason' }, false);
    await p1;

    expect(manager.getStatus().lastDisconnectReason).toBe('Old account kick reason');

    // Switch to new account
    const p2 = manager.connect('NewAccount', 'newpass', true);
    const status = manager.getStatus();
    expect(status.username).toBe('NewAccount');
    expect(status.lastDisconnectReason).toBeNull();
    expect(status.lastDisconnectPhase).toBeNull();
    expect(status.lastDisconnectCode).toBeNull();

    manager.disconnect(true);
    await p2;
  });

  it('storeCredentials disables other guild configs and removeCredentials preserves proxy', async () => {
    const { prisma } = await import('../src/db/prisma.js');
    const { MineflayerSecurity } = await import('../src/mineflayer/security.js');
    const security = new MineflayerSecurity();

    const updateManySpy = vi.spyOn(prisma.mineflayerAccountConfig, 'updateMany').mockResolvedValue({ count: 1 });
    const upsertSpy = vi.spyOn(prisma.mineflayerAccountConfig, 'upsert').mockResolvedValue({} as any);

    await security.storeCredentials('guild-2', 'NewUser', 'NewPass');

    // Should disable other enabled configs so startup picks guild-2
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { guildId: { not: 'guild-2' }, enabled: true },
      data: { enabled: false },
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: 'guild-2' },
        update: expect.objectContaining({ enabled: true }),
      })
    );

    updateManySpy.mockClear();
    await security.removeCredentials('guild-2');

    // Should clear username/password and disable without deleting the row (preserving proxy)
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { OR: [{ guildId: 'guild-2' }, { enabled: true }] },
      data: {
        encryptedUsername: null,
        encryptedPassword: null,
        enabled: false,
      },
    });

    updateManySpy.mockRestore();
    upsertSpy.mockRestore();
  });
});
