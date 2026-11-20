import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { successEmbed } from '../../utils/embeds.js';

export const chatOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerchat')
    .setDescription('Configure one-way Minecraft chat bridge')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the Discord channel to receive Minecraft chat')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Toggle the chat bridge')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable/Disable').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('style')
        .setDescription('Set the display style for relayed Minecraft chat')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Chat display mode')
            .setRequired(true)
            .addChoices(
              { name: 'ANSI Codeblock (Terminal Colors for Desktop)', value: 'ANSI' },
              { name: 'Embed Cards (Color-Coded Rank Borders, works on Mobile & Desktop)', value: 'EMBED' },
              { name: 'Clean Markdown (Bold Text, no code box)', value: 'MARKDOWN' }
            )
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { chatBridgeChannelId: channel.id, chatBridgeEnabled: true },
        create: { guildId, chatBridgeChannelId: channel.id, chatBridgeEnabled: true },
      });
      await interaction.editReply({
        embeds: [successEmbed('Chat Bridge Set', `Minecraft public chat will be forwarded to <#${channel.id}>.`)],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { chatBridgeEnabled: enabled },
        create: { guildId, chatBridgeEnabled: enabled },
      });
      await interaction.editReply({
        embeds: [successEmbed('Chat Bridge Toggle', `Chat bridge is now **${enabled ? 'ENABLED' : 'DISABLED'}**.`)],
      });
    } else if (sub === 'style') {
      const mode = interaction.options.getString('mode', true);
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { chatBridgeStyle: mode },
        create: { guildId, chatBridgeStyle: mode },
      });
      const modeDesc =
        mode === 'EMBED'
          ? 'Embed Cards (Vibrant Rank-Colored Borders on Mobile & Desktop)'
          : mode === 'MARKDOWN'
          ? 'Clean Markdown (Bold Text, no code box)'
          : 'ANSI Codeblock (Terminal Colors for Desktop)';

      await interaction.editReply({
        embeds: [successEmbed('Chat Style Updated', `Minecraft chat bridge display style set to: **${modeDesc}**.`)],
      });
    }
  },
};
