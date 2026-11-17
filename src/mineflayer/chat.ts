import { client } from '../bot.js';
import { prisma } from '../db/prisma.js';
import { mineflayerManager } from './client.js';
import { stripColorCodes, sanitizeChat } from '../utils/minecraft.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('chat-bridge');

export class ChatBridgeService {
  private recentMessageHashes = new Set<string>();
  private messageQueue: string[] = [];
  private isProcessingQueue = false;

  constructor() {
    this.registerListener();
  }

  private registerListener(): void {
    mineflayerManager.on('chatMessage', async (raw: string) => {
      await this.handleIncomingMinecraftMessage(raw);
    });
  }

  public async handleIncomingMinecraftMessage(raw: string): Promise<void> {
    const clean = stripColorCodes(raw).trim();
    if (!clean) return;

    // Filter non-public messages (PMs, Party, Guild, Staff)
    const lower = clean.toLowerCase();
    if (
      lower.startsWith('from ') ||
      lower.startsWith('to ') ||
      lower.includes('[party]') ||
      lower.includes('[guild]') ||
      lower.includes('[staff]') ||
      lower.includes('[msg]') ||
      lower.includes('whispers:')
    ) {
      log.debug({ message: clean }, 'Filtered non-public chat message');
      return;
    }

    // Deduplication check
    const hash = `${Date.now() - (Date.now() % 3000)}_${clean}`;
    if (this.recentMessageHashes.has(hash)) {
      return;
    }
    this.recentMessageHashes.add(hash);
    setTimeout(() => this.recentMessageHashes.delete(hash), 10000);

    // Queue message
    this.messageQueue.push(clean);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        await this.broadcastToDiscord(msg);
        // Small delay to prevent Discord rate limits
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async broadcastToDiscord(text: string): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        chatBridgeEnabled: true,
        chatBridgeChannelId: { not: null },
      },
    });

    const sanitized = sanitizeChat(text, 1950);

    for (const config of configs) {
      if (!config.chatBridgeChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.chatBridgeChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          await (channel as any).send({
            content: sanitized,
            allowedMentions: { parse: [] }, // Never allow pinging Discord users
          });
        }
      } catch (err: any) {
        log.warn({ guildId: config.guildId, err: err?.message }, 'Failed to deliver chat bridge message');
      }
    }
  }
}

export const chatBridgeService = new ChatBridgeService();
