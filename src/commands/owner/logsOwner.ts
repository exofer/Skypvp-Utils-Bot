import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
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
    .setDescription('Configure 13-category Discord logging system')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current logging channel configurations')
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
        const status = found?.enabled ? '🟢' : '⚪';
        return `${status} **${cat}**: ${channelStr}`;
      });

      embed.addFields({ name: 'Categories', value: lines.join('\n') });
      await interaction.editReply({ embeds: [embed] });
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
