import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { mineflayerSecurity } from '../../mineflayer/security.js';
import { maskProxyUrl, parseProxyUrl, testProxyConnection } from '../../mineflayer/proxy.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { env } from '../../config/env.js';

export const ownerAccountCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('owneraccount')
    .setDescription('Owner controls for the Mineflayer observation bot')
    .addSubcommand((sub) =>
      sub
        .setName('configure')
        .setDescription('Set Minecraft credentials for the bot')
        .addStringOption((opt) =>
          opt.setName('username').setDescription('Minecraft bot account username').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('password').setDescription('Minecraft password (for /login)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check live Mineflayer connection status')
    )
    .addSubcommand((sub) =>
      sub.setName('connect').setDescription('Connect the Mineflayer bot to PikaNetwork SkyPvP')
    )
    .addSubcommand((sub) =>
      sub.setName('test').setDescription('Alias for testing Mineflayer bot connection')
    )
    .addSubcommand((sub) =>
      sub.setName('reconnect').setDescription('Force reconnect the Mineflayer bot')
    )
    .addSubcommand((sub) =>
      sub.setName('disconnect').setDescription('Disconnect the Mineflayer bot')
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Erase stored Minecraft credentials from database')
    )
    .addSubcommand((sub) =>
      sub
        .setName('proxy-set')
        .setDescription('Configure a proxy for the Mineflayer bot (SOCKS5, SOCKS4, HTTP)')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('Proxy URL (e.g. socks5://user:pass@host:port or http://host:8080)')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('proxy-remove')
        .setDescription('Remove stored proxy configuration (reverts to direct connection)')
    )
    .addSubcommand((sub) =>
      sub
        .setName('proxy-test')
        .setDescription('Test connectivity through a proxy without restarting the bot')
        .addStringOption((opt) =>
          opt
            .setName('url')
            .setDescription('Optional proxy URL to test (uses configured proxy if omitted)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('proxy-status').setDescription('View current Mineflayer proxy configuration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send an in-game command as the Mineflayer bot')
        .addStringOption((opt) =>
          opt.setName('command').setDescription('The command to send (e.g. /server skypvp)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('cmd')
        .setDescription('Alias for sending an in-game command')
        .addStringOption((opt) =>
          opt.setName('command').setDescription('The command to send (e.g. /server skypvp)').setRequired(true)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId || 'global';

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'configure') {
      const username = interaction.options.getString('username', true).trim();
      const password = interaction.options.getString('password') || undefined;

      const prevStatus = mineflayerManager.getStatus();
      const wasActive =
        prevStatus.connected ||
        prevStatus.connecting ||
        prevStatus.circuitBreakerTripped ||
        mineflayerManager.hasPendingReconnect();

      await mineflayerSecurity.storeCredentials(guildId, username, password);

      if (wasActive) {
        const proxy = await mineflayerSecurity.getProxy(guildId);
        const proxyInfo = proxy ? ` via proxy \`${maskProxyUrl(proxy)}\`` : '';

        await interaction.editReply({
          embeds: [
            infoEmbed(
              'Switching Account...',
              `Saved encrypted credentials for **${username}**.\nDisconnecting previous session (\`${prevStatus.username || 'None'}\`) and connecting as **${username}**${proxyInfo}...`
            ),
          ],
        });

        const success = await mineflayerManager.manualReconnect(username, password, proxy || undefined);

        if (success) {
          await interaction.editReply({
            embeds: [
              successEmbed(
                'Account Switched & Connected',
                `Credentials for **${username}** stored with AES-256-GCM encryption at rest.\nSuccessfully connected to PikaNetwork as **${username}**!`
              ),
            ],
          });
        } else {
          const latest = mineflayerManager.getStatus();
          const reason = latest.lastDisconnectReason || latest.lastError || 'Connection failed or timed out';
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Account Updated (Connection Failed)',
                `Credentials for **${username}** were saved, and the old account was disconnected.\n\n` +
                `**Protocol Phase**: \`${latest.phase}\`\n` +
                `**Disconnect Reason**: \`${reason}\`\n` +
                `**Socket / Error Code**: \`${latest.lastDisconnectCode || 'None'}\``
              ),
            ],
          });
        }
      } else {
        // Ensure no stale username/password/timers from a previous account remain in memory
        mineflayerManager.disconnect(true);

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Credentials Configured',
              `Credentials for **${username}** stored with AES-256-GCM encryption at rest.\nPassword is never displayed or logged.\n\nUse \`/owneraccount connect\` to connect as **${username}**.`
            ),
          ],
        });
      }
    } else if (sub === 'status') {
      const status = mineflayerManager.getStatus();
      const uptimeStr = status.uptime ? `${Math.floor(status.uptime / 1000)}s` : 'N/A';

      const connBadge = status.connected
        ? '🟢 Connected'
        : status.connecting
        ? `🟡 Connecting (${status.phase})`
        : status.circuitBreakerTripped
        ? '🔴 Paused (Circuit Breaker Tripped)'
        : '🔴 Disconnected';

      const proxyBadge = status.proxy ? `🛡️ \`${status.proxy}\`` : 'Direct TCP (No proxy)';

      const embed = infoEmbed(
        'Mineflayer Status & Diagnostics',
        `**Connection**: ${connBadge}\n` +
        `**Protocol Phase**: \`${status.phase}\`\n` +
        `**Username**: \`${status.username || 'None'}\`\n` +
        `**Target Server**: \`${status.server}\`\n` +
        `**Network Route / Proxy**: ${proxyBadge}\n` +
        `**Current Location**: \`${status.currentSubserver}\` ${status.inSkyPvP ? '⚔️ **In SkyPvP**' : '⏳ **In Lobby/Hub**'}\n` +
        `**Uptime**: \`${uptimeStr}\`\n` +
        `**Consecutive Failures**: \`${status.reconnectAttempts}/5\` ${status.circuitBreakerTripped ? '⚠️ **Circuit Breaker Active (Auto-reconnect Paused)**' : ''}\n` +
        `**Last Disconnect Reason**: \`${status.lastDisconnectReason || 'None'}\`\n` +
        `**Last Disconnect Phase**: \`${status.lastDisconnectPhase || 'None'}\`\n` +
        `**Last Error / Socket Code**: \`${status.lastDisconnectCode || status.lastError || 'None'}\``
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'proxy-set') {
      const url = interaction.options.getString('url', true);
      try {
        const parsed = parseProxyUrl(url);
        await mineflayerSecurity.storeProxy(guildId, url);
        mineflayerManager.setProxy(url);

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Proxy Configured',
              `Mineflayer proxy set to **${maskProxyUrl(url)}** (${parsed.protocol.toUpperCase()}).\n` +
              `Encrypted with AES-256-GCM. Use \`/owneraccount connect\` or \`/owneraccount reconnect\` to connect through this proxy.`
            ),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Invalid Proxy URL',
              err?.message || 'Could not parse proxy URL. Expected format: `socks5://user:pass@host:port` or `http://host:port`'
            ),
          ],
        });
      }
    } else if (sub === 'proxy-remove') {
      await mineflayerSecurity.removeProxy(guildId);
      mineflayerManager.setProxy(env.MINEFLAYER_PROXY_URL || null);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Proxy Removed',
            'Database proxy configuration deleted.' +
            (env.MINEFLAYER_PROXY_URL
              ? `\n*Falling back to .env default:* \`${maskProxyUrl(env.MINEFLAYER_PROXY_URL)}\``
              : '\n*Reverted to direct TCP connection.*')
          ),
        ],
      });
    } else if (sub === 'proxy-status') {
      const dbProxy = await mineflayerSecurity.getProxy(guildId);
      const current = mineflayerManager.getStatus();

      const embed = infoEmbed(
        'Mineflayer Proxy Configuration',
        `**Active Bot Route**: ${current.proxy ? `🛡️ \`${current.proxy}\`` : 'Direct TCP (No proxy)'}\n` +
        `**Database Stored**: ${dbProxy ? `\`${maskProxyUrl(dbProxy)}\`` : 'None'}\n` +
        `**Environment Default (.env)**: ${env.MINEFLAYER_PROXY_URL ? `\`${maskProxyUrl(env.MINEFLAYER_PROXY_URL)}\`` : 'None'}\n\n` +
        `*Supported protocols: SOCKS5 (\`socks5://\`), SOCKS4 (\`socks4://\`), HTTP (\`http://\`)*`
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'proxy-test') {
      const inputUrl = interaction.options.getString('url');
      const testUrl = inputUrl || (await mineflayerSecurity.getProxy(guildId));

      if (!testUrl) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'No Proxy To Test',
              'No proxy is currently configured. Provide a proxy URL in the command: `/owneraccount proxy-test url:<url>`'
            ),
          ],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          infoEmbed('Testing Proxy...', `Attempting connection to PikaNetwork via \`${maskProxyUrl(testUrl)}\`...`),
        ],
      });

      const result = await testProxyConnection(testUrl, env.MINEFLAYER_HOST, env.MINEFLAYER_PORT);

      if (result.success) {
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Proxy Test Succeeded',
              `Successfully established tunnel to **${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}**!\n\n` +
              `**Proxy**: \`${result.maskedUrl}\`\n` +
              `**Protocol**: \`${result.protocol.toUpperCase()}\`\n` +
              `**Handshake Latency**: \`${result.latencyMs}ms\``
            ),
          ],
        });
      } else {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Proxy Test Failed',
              `Could not reach **${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}** through proxy.\n\n` +
              `**Proxy**: \`${result.maskedUrl}\`\n` +
              `**Latency / Timeout**: \`${result.latencyMs}ms\`\n` +
              `**Error**: \`${result.error || 'Connection failed'}\``
            ),
          ],
        });
      }
    } else if (sub === 'connect' || sub === 'test' || sub === 'reconnect') {
      const validation = await mineflayerSecurity.validateCredentials(guildId);
      if (!validation.valid) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              validation.configured ? 'Credential Decryption Error' : 'No Credentials Configured',
              validation.error || 'Please run `/owneraccount configure` to configure valid credentials.'
            ),
          ],
        });
        return;
      }

      const creds = await mineflayerSecurity.getCredentials(guildId);
      if (!creds) {
        await interaction.editReply({
          embeds: [errorEmbed('No Credentials', 'Run `/owneraccount configure` first to set credentials.')],
        });
        return;
      }

      const proxy = await mineflayerSecurity.getProxy(guildId);
      const proxyInfo = proxy ? ` via proxy \`${maskProxyUrl(proxy)}\`` : '';

      await interaction.editReply({
        embeds: [
          infoEmbed(
            'Connecting...',
            `Attempting connection as **${creds.username}** to \`${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}\`${proxyInfo}...\n*Resetting any previous retry counters and circuit breaker.*`
          ),
        ],
      });

      // Manual connect/reconnect resets circuit breaker and retry counters
      const success = await mineflayerManager.manualReconnect(creds.username, creds.password, proxy || undefined);

      if (success) {
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Connected Successfully',
              `Successfully authenticated and connected to PikaNetwork as **${creds.username}**!`
            ),
          ],
        });
      } else {
        const latest = mineflayerManager.getStatus();
        const reason = latest.lastDisconnectReason || latest.lastError || 'Connection failed or timed out';
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Connection Failed',
              `Could not connect to **${latest.server}**.\n\n` +
              `**Protocol Phase**: \`${latest.phase}\`\n` +
              `**Server Kick / Disconnect Reason**: \`${reason}\`\n` +
              `**Socket / Error Code**: \`${latest.lastDisconnectCode || 'None'}\`\n\n` +
              `*Check bot logs for full diagnostic trace.*`
            ),
          ],
        });
      }
    } else if (sub === 'disconnect') {
      mineflayerManager.disconnect();
      await interaction.editReply({
        embeds: [successEmbed('Disconnected', 'Mineflayer bot has been disconnected and listeners cleared.')],
      });
    } else if (sub === 'remove') {
      await mineflayerSecurity.removeCredentials(guildId);
      mineflayerManager.disconnect(true);
      await interaction.editReply({
        embeds: [successEmbed('Credentials Removed', 'Stored Minecraft credentials deleted from database and cleared from active session.')],
      });
    } else if (sub === 'send' || sub === 'cmd') {
      const command = interaction.options.getString('command', true);
      if (!mineflayerManager.isConnected()) {
        await interaction.editReply({
          embeds: [errorEmbed('Not Connected', 'Mineflayer bot is not connected. Connect first with `/owneraccount connect`.')],
        });
        return;
      }

      mineflayerManager.sendCommand(command);
      await interaction.editReply({
        embeds: [successEmbed('Command Sent', `Dispatched in-game command: \`${command}\``)],
      });
    }
  },
};
