import { prisma } from '../db/prisma.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { createLogger } from '../utils/logger.js';
import { env } from '../config/env.js';

const log = createLogger('mineflayer-security');

export interface CredentialValidationResult {
  valid: boolean;
  configured: boolean;
  error?: string;
  username?: string;
}

export class MineflayerSecurity {
  /**
   * Save encrypted credentials for a guild or global bot instance
   */
  public async storeCredentials(guildId: string, username: string, password?: string) {
    const encryptedUsername = encrypt(username);
    const encryptedPassword = password ? encrypt(password) : null;

    log.info({ guildId }, 'Encrypting and persisting Mineflayer credentials');

    return prisma.mineflayerAccountConfig.upsert({
      where: { guildId },
      update: {
        encryptedUsername,
        encryptedPassword,
        enabled: true,
      },
      create: {
        guildId,
        encryptedUsername,
        encryptedPassword,
        enabled: true,
      },
    });
  }

  /**
   * Validate whether credentials exist and can be successfully decrypted
   * with the current ENCRYPTION_KEY in .env
   */
  public async validateCredentials(guildId: string): Promise<CredentialValidationResult> {
    const config = await prisma.mineflayerAccountConfig.findUnique({
      where: { guildId },
    });

    if (!config || !config.encryptedUsername) {
      return {
        valid: false,
        configured: false,
        error: 'No Minecraft bot credentials configured for this server. Use `/owneraccount configure`.',
      };
    }

    try {
      const username = decrypt(config.encryptedUsername);
      if (config.encryptedPassword) {
        decrypt(config.encryptedPassword);
      }
      return {
        valid: true,
        configured: true,
        username,
      };
    } catch (err: any) {
      log.error(
        { guildId, err: err?.message },
        'Failed to decrypt Mineflayer credentials. The ENCRYPTION_KEY in .env may have been modified.'
      );
      return {
        valid: false,
        configured: true,
        error:
          'Failed to decrypt credentials. The ENCRYPTION_KEY in .env was changed since credentials were saved. Please re-run `/owneraccount configure` with your credentials.',
      };
    }
  }

  /**
   * Retrieve and decrypt credentials
   */
  public async getCredentials(guildId: string): Promise<{ username: string; password?: string } | null> {
    const config = await prisma.mineflayerAccountConfig.findUnique({
      where: { guildId },
    });

    if (!config || !config.encryptedUsername) {
      return null;
    }

    try {
      const username = decrypt(config.encryptedUsername);
      const password = config.encryptedPassword ? decrypt(config.encryptedPassword) : undefined;
      return { username, password };
    } catch (err: any) {
      log.error({ err: err?.message, guildId }, 'Failed to decrypt Mineflayer credentials');
      return null;
    }
  }

  /**
   * Remove stored credentials
   */
  public async removeCredentials(guildId: string) {
    return prisma.mineflayerAccountConfig.deleteMany({
      where: { guildId },
    });
  }

  /**
   * Store encrypted proxy URL for a guild or global bot instance
   */
  public async storeProxy(guildId: string, proxyUrl: string) {
    const encryptedProxyUrl = encrypt(proxyUrl.trim());

    log.info({ guildId }, 'Encrypting and persisting Mineflayer proxy configuration');

    return prisma.mineflayerAccountConfig.upsert({
      where: { guildId },
      update: {
        encryptedProxyUrl,
      },
      create: {
        guildId,
        encryptedProxyUrl,
      },
    });
  }

  /**
   * Remove stored proxy configuration (reverts to direct or .env proxy)
   */
  public async removeProxy(guildId: string) {
    log.info({ guildId }, 'Removing stored Mineflayer proxy configuration');
    return prisma.mineflayerAccountConfig.updateMany({
      where: { guildId },
      data: {
        encryptedProxyUrl: null,
      },
    });
  }

  /**
   * Retrieve and decrypt proxy URL
   * Returns DB configured proxy first, falling back to MINEFLAYER_PROXY_URL from .env
   */
  public async getProxy(guildId?: string): Promise<string | null> {
    if (guildId) {
      try {
        const config = await prisma.mineflayerAccountConfig.findUnique({
          where: { guildId },
        });

        if (config?.encryptedProxyUrl) {
          return decrypt(config.encryptedProxyUrl);
        }
      } catch (err: any) {
        log.error({ err: err?.message, guildId }, 'Failed to decrypt stored proxy configuration');
      }
    }

    // Fallback to environment variable if configured
    if (env.MINEFLAYER_PROXY_URL && env.MINEFLAYER_PROXY_URL.trim().length > 0) {
      return env.MINEFLAYER_PROXY_URL.trim();
    }

    return null;
  }
}

export const mineflayerSecurity = new MineflayerSecurity();
