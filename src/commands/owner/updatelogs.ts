import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';
import { isOwner } from '../../permissions/guard.js';

export const updateLogsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('updatelogs')
    .setDescription('Publish a professional release announcement to the updates channel')
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Update title (e.g. Major Patch)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('version').setDescription('Release version tag (e.g. v2.4.0)').setRequired(true)
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
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

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

    // Build the announcement embed
    const releaseEmbed = infoEmbed(
      `🚀 ${title} — ${version}`,
      `${description}\n\n*Released <t:${Math.floor(Date.now() / 1000)}:D>*`
    );
    releaseEmbed.setColor(COLORS.INFO);

    if (features) {
      releaseEmbed.addFields({
        name: '✨ New Features',
        value: features.replace(/\\n/g, '\n'),
        inline: false,
      });
    }

    if (improvements) {
      releaseEmbed.addFields({
        name: '⚡ Improvements & Changes',
        value: improvements.replace(/\\n/g, '\n'),
        inline: false,
      });
    }

    if (bugfixes) {
      releaseEmbed.addFields({
        name: '🐛 Bug Fixes',
        value: bugfixes.replace(/\\n/g, '\n'),
        inline: false,
      });
    }

    if (notes) {
      releaseEmbed.addFields({
        name: '📌 Notes',
        value: notes.replace(/\\n/g, '\n'),
        inline: false,
      });
    }

    // Confirmation Buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_publish')
      .setLabel('Publish Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📢');

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_publish')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    const previewMsg = await interaction.reply({
      content: `**Release Announcement Preview**\n*Target Channel:* <#${config.updatesChannelId}>\nReview below and confirm publication:`,
      embeds: [releaseEmbed],
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    // Await confirmation
    try {
      const response = await previewMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (btn) => isOwner(btn.user.id),
        time: 60000,
      });

      if (response.customId === 'cancel_publish') {
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

      const publishedMessage = await (targetChannel as any).send({ embeds: [releaseEmbed] });

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

      await response.update({
        content: `✅ Successfully published **${version}** to <#${config.updatesChannelId}>!\n[Jump to Announcement](${publishedMessage.url})`,
        embeds: [],
        components: [],
      });
    } catch (_) {
      await interaction.editReply({
        content: '⏳ Publication timed out. Use `/updatelogs` again when ready.',
        embeds: [],
        components: [],
      });
    }
  },
};
