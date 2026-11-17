import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';

export const auctionFeedCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('auctionfeed')
    .setDescription('Configure the server public auction feed channel')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current auction feed settings')
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the channel for public auction announcements')
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('The destination channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable the public auction feed')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Turn feed on or off').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('test').setDescription('Send a test auction listing to the feed channel')
    ),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        embeds: [errorEmbed('Guild Only', 'This command can only be used in a server.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    let config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    if (sub === 'view') {
      const channelMention = config.auctionFeedChannelId ? `<#${config.auctionFeedChannelId}>` : 'Not set';
      const status = config.auctionFeedEnabled ? '🟢 Enabled' : '🔴 Disabled';

      const embed = infoEmbed(
        'Auction Feed Configuration',
        `**Status**: ${status}\n**Channel**: ${channelMention}`
      );
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      config = await prisma.guildConfig.update({
        where: { guildId },
        data: { auctionFeedChannelId: channel.id, auctionFeedEnabled: true },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Channel Updated',
            `Public auction feed channel set to <#${channel.id}> and feed has been enabled.`
          ),
        ],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      config = await prisma.guildConfig.update({
        where: { guildId },
        data: { auctionFeedEnabled: enabled },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Auction Feed Toggled',
            `Public auction feed is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`
          ),
        ],
      });
    } else if (sub === 'test') {
      if (!config.auctionFeedChannelId) {
        await interaction.editReply({
          embeds: [errorEmbed('No Channel Configured', 'Set a channel first with `/auctionfeed channel`.')],
        });
        return;
      }

      try {
        const channel = await interaction.client.channels.fetch(config.auctionFeedChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          const testEmbed = infoEmbed(
            '🏷️ Test SkyPvP Auction Listing',
            '**Test Dragon Sword** has been listed on the SkyPvP Auction House!'
          );
          testEmbed.setColor(COLORS.AUCTION);
          testEmbed.addFields([
            { name: '📦 Item', value: 'Test Dragon Sword (x1)', inline: true },
            { name: '👤 Seller', value: '`TestPlayer`', inline: true },
            { name: '💰 Price', value: '$250,000', inline: true },
          ]);
          await (channel as any).send({ embeds: [testEmbed] });

          await interaction.editReply({
            embeds: [successEmbed('Test Sent', `Test listing posted to <#${config.auctionFeedChannelId}>.`)],
          });
        }
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Failed', `Could not send message to channel: ${err.message}`)],
        });
      }
    }
  },
};
