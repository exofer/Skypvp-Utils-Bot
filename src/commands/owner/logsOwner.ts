import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, AttachmentBuilder } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { discordLogger, type LogCategoryType } from '../../services/logging.js';

const ALL_CATEGORIES: LogCategoryType[] = [
  'COMMAND',
  'ADMIN',
  'OWNER',
  'AUCTION',
  'EVENT',
  'KOTH',
  'STRONGHOLD',
  'OUTPOST',
  'CHAT_BRIDGE',
  'MINEFLAYER',
  'SYSTEM',
  'API',
  'UPDATE_PUBLICATION',
];

export const logsOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerlogs')
    .setDescription('Configure 13-category Discord logging system and audit logs')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current logging channel configurations and status')
    )
    .addSubcommand((sub) =>
      sub
        .setName('level')
        .setDescription('Configure the minimum logging level')
        .addStringOption((opt) =>
          opt
            .setName('severity')
            .setDescription('Minimum severity level to log')
            .setRequired(true)
            .addChoices(
              { name: 'DEBUG (Detailed traces & diagnostics)', value: 'DEBUG' },
              { name: 'INFO (Normal operational messages)', value: 'INFO' },
              { name: 'WARN (Warnings and degraded operations)', value: 'WARN' },
              { name: 'ERROR (Failures and critical issues)', value: 'ERROR' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Specific category to set level for (leave empty for all)')
            .setRequired(false)
            .addChoices(...ALL_CATEGORIES.map((c) => ({ name: c, value: c })))
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('Export recent administrative audit logs as a downloadable file')
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Number of records to export (default: 100, max: 1000)')
            .setMinValue(10)
            .setMaxValue(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set a channel for a specific log category')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(...ALL_CATEGORIES.map((c) => ({ name: c, value: c })))
        )
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove logging channel for a category')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(...ALL_CATEGORIES.map((c) => ({ name: c, value: c })))
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable a logging category')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(...ALL_CATEGORIES.map((c) => ({ name: c, value: c })))
        )
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test message to a log category channel')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(...ALL_CATEGORIES.map((c) => ({ name: c, value: c })))
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'view') {
      const configs = await prisma.logConfiguration.findMany({
        where: { guildId },
      });

      const embed = infoEmbed('Discord Logging Configuration', 'Status of all 13 log categories:');
      const lines = ALL_CATEGORIES.map((cat) => {
        const found = configs.find((c) => c.category === cat);
        const channelStr = found?.channelId ? `<#${found.channelId}>` : '`Not Set`';
        const levelStr = found?.level ? `[${found.level}]` : '[INFO]';
        const status = found?.enabled ? '🟢' : '⚪';
        return `${status} **${cat}** ${levelStr}: ${channelStr}`;
      });

      embed.addFields({ name: 'Categories', value: lines.join('\n') });
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'level') {
      const severity = interaction.options.getString('severity', true);
      const category = interaction.options.getString('category');

      if (category) {
        await prisma.logConfiguration.upsert({
          where: {
            guildId_category: { guildId, category: category as any },
          },
          update: { level: severity },
          create: { guildId, category: category as any, level: severity },
        });

        await interaction.editReply({
          embeds: [successEmbed('Log Level Set', `Log level for **${category}** set to **${severity}**.`)],
        });
      } else {
        for (const cat of ALL_CATEGORIES) {
          await prisma.logConfiguration.upsert({
            where: {
              guildId_category: { guildId, category: cat as any },
            },
            update: { level: severity },
            create: { guildId, category: cat as any, level: severity },
          });
        }

        await interaction.editReply({
          embeds: [successEmbed('Global Log Level Set', `Minimum log level for **all 13 categories** set to **${severity}**.`)],
        });
      }
    } else if (sub === 'export') {
      const limit = interaction.options.getInteger('limit') || 100;

      const logs = await prisma.adminAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      if (logs.length === 0) {
        await interaction.editReply({
          embeds: [infoEmbed('No Audit Logs', 'There are no administrative audit logs recorded for this server yet.')],
        });
        return;
      }

      const formatted = logs.map((l) => ({
        id: l.id,
        timestamp: l.createdAt.toISOString(),
        userId: l.userId,
        action: l.action,
        details: l.details ? JSON.parse(l.details) : null,
      }));

      const jsonBuffer = Buffer.from(JSON.stringify(formatted, null, 2), 'utf-8');
      const attachment = new AttachmentBuilder(jsonBuffer, {
        name: `audit_logs_${guildId}_${Date.now()}.json`,
      });

      await interaction.editReply({
        content: `📁 Exported **${logs.length}** audit records for this server:`,
        files: [attachment],
      });
    } else if (sub === 'channel') {
      const category = interaction.options.getString('category', true) as LogCategoryType;
      const channel = interaction.options.getChannel('target', true);

      // Ensure GuildConfig exists first due to foreign key
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: {},
        create: { guildId },
      });

      await prisma.logConfiguration.upsert({
        where: {
          guildId_category: { guildId, category: category as any },
        },
        update: { channelId: channel.id, enabled: true },
        create: { guildId, category: category as any, channelId: channel.id, enabled: true },
      });

      await interaction.editReply({
        embeds: [successEmbed('Channel Set', `Logs for **${category}** will be sent to <#${channel.id}>.`)],
      });
    } else if (sub === 'remove') {
      const category = interaction.options.getString('category', true) as LogCategoryType;
      await prisma.logConfiguration.deleteMany({
        where: { guildId, category: category as any },
      });
      await interaction.editReply({
        embeds: [successEmbed('Logging Removed', `Logging for **${category}** has been cleared.`)],
      });
    } else if (sub === 'toggle') {
      const category = interaction.options.getString('category', true) as LogCategoryType;
      const enabled = interaction.options.getBoolean('enabled', true);

      await prisma.logConfiguration.updateMany({
        where: { guildId, category: category as any },
        data: { enabled },
      });

      await interaction.editReply({
        embeds: [successEmbed('Toggled', `Category **${category}** is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    } else if (sub === 'test') {
      const category = interaction.options.getString('category', true) as LogCategoryType;
      await discordLogger.logEvent(guildId, category, 'Test Log Notification', {
        ExecutedBy: interaction.user.tag,
        Timestamp: new Date().toISOString(),
        Status: 'Verification Check OK',
      });

      await interaction.editReply({
        embeds: [successEmbed('Test Dispatched', `Test log record sent for **${category}**.`)],
      });
    }
  },
};
