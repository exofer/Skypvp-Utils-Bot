import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { mineflayerSecurity } from '../../mineflayer/security.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';

export const ownerAccountCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('account')
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
      sub.setName('test').setDescription('Test connect to PikaNetwork SkyPvP')
    )
    .addSubcommand((sub) =>
      sub.setName('reconnect').setDescription('Force reconnect the Mineflayer bot')
    )
    .addSubcommand((sub) =>
      sub.setName('disconnect').setDescription('Disconnect the Mineflayer bot')
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Erase stored Minecraft credentials from database')
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

      const embed = infoEmbed(
        'Mineflayer Status',
        `**Connection**: ${status.connected ? '🟢 Connected' : status.connecting ? '🟡 Connecting' : '🔴 Disconnected'}\n` +
        `**Username**: \`${status.username || 'None'}\`\n` +
        `**Target Server**: \`${status.server}\`\n` +
        `**Uptime**: \`${uptimeStr}\`\n` +
        `**Last Error**: \`${status.lastError || 'None'}\``
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'test' || sub === 'reconnect') {
      const creds = await mineflayerSecurity.getCredentials(guildId);
      if (!creds) {
        await interaction.editReply({
          embeds: [errorEmbed('No Credentials', 'Run `/account configure` first to set credentials.')],
        });
        return;
      }

      if (mineflayerManager.isConnected()) {
        mineflayerManager.disconnect();
      }

      await interaction.editReply({
        embeds: [infoEmbed('Connecting...', `Attempting connection as **${creds.username}**...`)],
      });

      const success = await mineflayerManager.connect(creds.username, creds.password);

      if (success) {
        await interaction.followUp({
          embeds: [successEmbed('Connected', `Successfully connected to PikaNetwork as **${creds.username}**.`)],
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          embeds: [errorEmbed('Connection Failed', `Could not connect: ${mineflayerManager.getStatus().lastError}`)],
          ephemeral: true,
        });
      }
    } else if (sub === 'disconnect') {
      mineflayerManager.disconnect();
      await interaction.editReply({
        embeds: [successEmbed('Disconnected', 'Mineflayer bot has been disconnected.')],
      });
    } else if (sub === 'remove') {
      await mineflayerSecurity.removeCredentials(guildId);
      mineflayerManager.disconnect();
      await interaction.editReply({
        embeds: [successEmbed('Credentials Erased', 'Stored credentials have been permanently deleted.')],
      });
    }
  },
};
