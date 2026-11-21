import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { mineflayerSecurity } from '../../mineflayer/security.js';
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
      const username = interaction.options.getString('username', true);
      const password = interaction.options.getString('password') || undefined;

      await mineflayerSecurity.storeCredentials(guildId, username, password);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Credentials Configured',
            `Credentials for **${username}** stored with AES-256-GCM encryption at rest.\nPassword is never displayed or logged.`
          ),
        ],
      });
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

      const embed = infoEmbed(
        'Mineflayer Status & Diagnostics',
        `**Connection**: ${connBadge}\n` +
        `**Protocol Phase**: \`${status.phase}\`\n` +
        `**Username**: \`${status.username || 'None'}\`\n` +
        `**Target Server**: \`${status.server}\`\n` +
        `**Current Location**: \`${status.currentSubserver}\` ${status.inSkyPvP ? '⚔️ **In SkyPvP**' : '⏳ **In Lobby/Hub**'}\n` +
        `**Uptime**: \`${uptimeStr}\`\n` +
        `**Consecutive Failures**: \`${status.reconnectAttempts}/5\` ${status.circuitBreakerTripped ? '⚠️ **Circuit Breaker Active (Auto-reconnect Paused)**' : ''}\n` +
        `**Last Disconnect Reason**: \`${status.lastDisconnectReason || 'None'}\`\n` +
        `**Last Disconnect Phase**: \`${status.lastDisconnectPhase || 'None'}\`\n` +
        `**Last Error / Socket Code**: \`${status.lastDisconnectCode || status.lastError || 'None'}\``
      );

      await interaction.editReply({ embeds: [embed] });
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

      await interaction.editReply({
        embeds: [
          infoEmbed(
            'Connecting...',
            `Attempting connection as **${creds.username}** to \`${env.MINEFLAYER_HOST}:${env.MINEFLAYER_PORT}\`...\n*Resetting any previous retry counters and circuit breaker.*`
          ),
        ],
      });

      // Manual connect/reconnect resets circuit breaker and retry counters
      const success = await mineflayerManager.manualReconnect(creds.username, creds.password);

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
      mineflayerManager.disconnect();
      await interaction.editReply({
        embeds: [successEmbed('Credentials Removed', 'Stored Minecraft credentials deleted from database.')],
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
