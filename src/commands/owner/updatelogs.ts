import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';
import { isOwner } from '../../permissions/guard.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('command-updatelogs');

function splitFieldContent(content: string, maxLen = 1024): string[] {
  if (content.length <= maxLen) return [content];
  const parts: string[] = [];
  const lines = content.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen) {
      if (current.length > 0) parts.push(current);
      current = line;
    } else {
      current = current.length > 0 ? current + '\n' + line : line;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export const updateLogsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('updatelogs')
    .setDescription('Create, preview, publish, and view release announcements')
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Create and publish a new release announcement to the updates channel')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Update title (e.g. Combat & Economy Overhaul)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('version').setDescription('Release version tag (e.g. v2.5.0)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Short summary of the update').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('features').setDescription('New features (use \\n for list items)').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('improvements').setDescription('Improvements and balance changes').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('bugfixes').setDescription('Bug fixes').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('notes').setDescription('Optional extra notes').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List previously published release announcements')
        .addIntegerOption((opt) =>
          opt.setName('page').setDescription('Page number (default: 1)').setMinValue(1).setRequired(false)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        embeds: [errorEmbed('Guild Only', 'This command must be run within a Discord server.')],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand(false) || 'post';

    if (subcommand === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const page = interaction.options.getInteger('page') || 1;
      const pageSize = 5;
      const skip = (page - 1) * pageSize;

      const [total, updates] = await Promise.all([
        prisma.updateAnnouncement.count(),
        prisma.updateAnnouncement.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);

      if (updates.length === 0) {
        await interaction.editReply({
          embeds: [infoEmbed('Release Announcements', 'No release announcements have been published yet.')],
        });
        return;
      }

      const totalPages = Math.ceil(total / pageSize);
      const embed = infoEmbed(
        '📜 Published Release Announcements',
        `Showing page **${page}** of **${totalPages}** (${total} total announcements):`
      );

      for (const u of updates) {
        const dateStr = u.publishedAt
          ? `<t:${Math.floor(u.publishedAt.getTime() / 1000)}:R>`
          : `<t:${Math.floor(u.createdAt.getTime() / 1000)}:R>`;
        const linkStr = u.messageId && u.channelId
          ? ` • [Jump to Message](https://discord.com/channels/${guildId}/${u.channelId}/${u.messageId})`
          : '';

        embed.addFields({
          name: `🚀 ${u.title} (${u.version || 'v1.0.0'})`,
          value: `*Published ${dateStr} by <@${u.publisherId}> in <#${u.channelId}>${linkStr}*\n${u.description || 'No description provided.'}`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // --- Subcommand: post ---
    const title = interaction.options.getString('title', true);
    const version = interaction.options.getString('version', true);
    const description = interaction.options.getString('description', true);
    const features = interaction.options.getString('features') || null;
    const improvements = interaction.options.getString('improvements') || null;
    const bugfixes = interaction.options.getString('bugfixes') || null;
    const notes = interaction.options.getString('notes') || null;

    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config || !config.updatesChannelId) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Channel Not Configured',
            'Please configure the destination channel first with `/ownerupdates channel`.'
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Build the announcement embed respecting Discord limits
    const releaseEmbed = new EmbedBuilder()
      .setTitle(`🚀 ${title.slice(0, 240)} — ${version.slice(0, 50)}`)
      .setDescription(
        `${description.slice(0, 3800)}\n\n*Released <t:${Math.floor(Date.now() / 1000)}:D>*`
      )
      .setColor(COLORS.INFO)
      .setFooter({ text: 'SkyPvP Utils • Official Release • Made by Exhaus (@xhaus.eta)' })
      .setTimestamp();

    if (features) {
      const splits = splitFieldContent(features.replace(/\\n/g, '\n'));
      splits.forEach((part, idx) => {
        releaseEmbed.addFields({
          name: idx === 0 ? '✨ New Features' : '✨ New Features (Cont.)',
          value: part,
          inline: false,
        });
      });
    }

    if (improvements) {
      const splits = splitFieldContent(improvements.replace(/\\n/g, '\n'));
      splits.forEach((part, idx) => {
        releaseEmbed.addFields({
          name: idx === 0 ? '⚡ Improvements & Changes' : '⚡ Improvements (Cont.)',
          value: part,
          inline: false,
        });
      });
    }

    if (bugfixes) {
      const splits = splitFieldContent(bugfixes.replace(/\\n/g, '\n'));
      splits.forEach((part, idx) => {
        releaseEmbed.addFields({
          name: idx === 0 ? '🐛 Bug Fixes' : '🐛 Bug Fixes (Cont.)',
          value: part,
          inline: false,
        });
      });
    }

    if (notes) {
      const splits = splitFieldContent(notes.replace(/\\n/g, '\n'));
      splits.forEach((part, idx) => {
        releaseEmbed.addFields({
          name: idx === 0 ? '📌 Notes' : '📌 Notes (Cont.)',
          value: part,
          inline: false,
        });
      });
    }

    // Confirmation Buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_publish_update')
      .setLabel('Publish Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📢');

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_publish_update')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    const roleNotice = config.updatesRoleId ? `\n*Role Mention:* <@&${config.updatesRoleId}>` : '';

    const previewMsg = await interaction.reply({
      content: `**Release Announcement Preview**\n*Target Channel:* <#${config.updatesChannelId}>${roleNotice}\nReview the formatted embed below and confirm publication:`,
      embeds: [releaseEmbed],
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    // Await confirmation with owner validation
    try {
      const response = await previewMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (btn) => isOwner(btn.user.id),
        time: 90000,
      });

      if (response.customId === 'cancel_publish_update') {
        await response.update({
          content: '❌ Release announcement publication was cancelled.',
          embeds: [],
          components: [],
        });
        return;
      }

      // Publish to target channel
      const targetChannel = await interaction.client.channels.fetch(config.updatesChannelId);
      if (!targetChannel || !targetChannel.isTextBased() || !('send' in targetChannel)) {
        await response.update({
          content: '❌ Failed to access the target channel.',
          embeds: [],
          components: [],
        });
        return;
      }

      const sendPayload: any = { embeds: [releaseEmbed] };
      if (config.updatesRoleId && config.updatesNotificationsEnabled !== false) {
        sendPayload.content = `<@&${config.updatesRoleId}>`;
      }

      const publishedMessage = await (targetChannel as any).send(sendPayload);

      // Save to database
      await prisma.updateAnnouncement.create({
        data: {
          title,
          version,
          description,
          features,
          improvements,
          bugFixes: bugfixes,
          notes,
          publisherId: interaction.user.id,
          channelId: config.updatesChannelId,
          messageId: publishedMessage.id,
          published: true,
          publishedAt: new Date(),
        },
      });

      log.info(
        { title, version, channelId: config.updatesChannelId, messageId: publishedMessage.id },
        'Published update announcement'
      );

      await response.update({
        content: `✅ Successfully published **${version}** to <#${config.updatesChannelId}>!\n[Jump to Announcement](${publishedMessage.url})`,
        embeds: [],
        components: [],
      });
    } catch (_) {
      await interaction.editReply({
        content: '⏳ Publication timed out. Use `/updatelogs post` again when ready.',
        embeds: [],
        components: [],
      });
    }
  },
};
