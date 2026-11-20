import { client } from '../bot.js';
import { prisma } from '../db/prisma.js';
import { mineflayerManager } from './client.js';
import {
  formatChatPayload,
  isPrivateOrRestrictedMessage,
  isIgnoredOrSpamMessage,
  stripColorCodes,
} from './chatParser.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('chat-bridge');

interface QueuedChatMessage {
  raw: string;
  jsonMsg?: any;
}

export class ChatBridgeService {
  private recentMessageHashes = new Set<string>();
  private messageQueue: QueuedChatMessage[] = [];
  private isProcessingQueue = false;

  constructor() {
    this.registerListener();
  }

  private registerListener(): void {
    mineflayerManager.on('chatMessage', async (raw: string, jsonMsg?: any) => {
      await this.handleIncomingMinecraftMessage(raw, jsonMsg);
    });
  }

  public async handleIncomingMinecraftMessage(raw: string, jsonMsg?: any): Promise<void> {
    // 1. Filter internal connection, lobby prompts, and HUD level progress bar spam
    if (isIgnoredOrSpamMessage(raw)) {
      return;
    }

    // 2. Filter non-public messages (PMs, Party, Guild, Staff)
    if (isPrivateOrRestrictedMessage(raw)) {
      log.debug({ message: raw }, 'Filtered non-public chat message');
      return;
    }

    const clean = stripColorCodes(raw).trim();
    if (!clean) return;

    // 3. Deduplication check (within 3 seconds)
    const hash = `${Date.now() - (Date.now() % 3000)}_${clean}`;
    if (this.recentMessageHashes.has(hash)) {
      return;
    }
    this.recentMessageHashes.add(hash);
    setTimeout(() => this.recentMessageHashes.delete(hash), 10000);

    // 4. Queue message for processing
    this.messageQueue.push({ raw, jsonMsg });
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue.shift()!;
        await this.broadcastToDiscord(item);
        // Delay to prevent Discord rate limits
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async broadcastToDiscord(item: QueuedChatMessage): Promise<void> {
    const configs = await prisma.guildConfig.findMany({
      where: {
        chatBridgeEnabled: true,
        chatBridgeChannelId: { not: null },
      },
    });

    for (const config of configs) {
      if (!config.chatBridgeChannelId) continue;

      try {
        const channel = await client.channels.fetch(config.chatBridgeChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          const style = (config as any).chatBridgeStyle || 'ANSI';
          const payload = formatChatPayload(item.raw, item.jsonMsg, style);

          await (channel as any).send({
            ...payload,
            allowedMentions: { parse: [] }, // Never allow pinging Discord users
          });
          log.info(
            { guildId: config.guildId, channelId: config.chatBridgeChannelId, style },
            'Relayed Minecraft chat message to Discord'
          );
        }
      } catch (err: any) {
        log.warn(
          { guildId: config.guildId, channelId: config.chatBridgeChannelId, err: err?.message },
          'Failed to deliver chat bridge message'
        );
      }
    }
  }
}

export const chatBridgeService = new ChatBridgeService();
