import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';

export const updatesOwnerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('ownerupdates')
    .setDescription('Configure destination channel and role ping for /updatelogs release announcements')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the updates publication channel')
        .addChannelOption((opt) =>
          opt.setName('target').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('role')
        .setDescription('Set the role to ping when a release announcement is published')
        .addRoleOption((opt) =>
          opt.setName('target_role').setDescription('Role to ping').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable update announcements and role pings')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable/Disable update notifications').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View current updates channel, role, and toggle settings')
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove configured updates channel and role')
    )
    .addSubcommand((sub) =>
      sub.setName('test').setDescription('Send a test release announcement to the updates channel')
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    let config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('target', true);
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesChannelId: channel.id, updatesNotificationsEnabled: true },
      });

      await interaction.editReply({
        embeds: [successEmbed('Updates Channel Set', `Release logs will be published to <#${channel.id}>.`)],
      });
    } else if (sub === 'role') {
      const role = interaction.options.getRole('target_role', true);
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesRoleId: role.id },
      });

      await interaction.editReply({
        embeds: [successEmbed('Updates Role Set', `Release announcements will mention <@&${role.id}>.`)],
      });
    } else if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesNotificationsEnabled: enabled },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Updates Notifications Toggled',
            `Release announcements are now **${enabled ? 'ENABLED' : 'DISABLED'}**.`
          ),
        ],
      });
    } else if (sub === 'view') {
      const channelStr = config.updatesChannelId ? `<#${config.updatesChannelId}>` : '`Not Set`';
      const roleStr = config.updatesRoleId ? `<@&${config.updatesRoleId}>` : '`None`';
      const toggleStr = config.updatesNotificationsEnabled !== false ? '🟢 Enabled' : '🔴 Disabled';

      const embed = infoEmbed(
        'Release Updates Configuration',
        `**Destination Channel**: ${channelStr}\n` +
        `**Notification Role**: ${roleStr}\n` +
        `**Status**: ${toggleStr}`
      );
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'remove') {
      await prisma.guildConfig.update({
        where: { guildId },
        data: { updatesChannelId: null, updatesRoleId: null },
      });
      await interaction.editReply({
        embeds: [successEmbed('Cleared', 'Updates destination channel and role have been removed.')],
      });
    } else if (sub === 'test') {
      if (!config.updatesChannelId) {
        await interaction.editReply({
          embeds: [infoEmbed('Channel Not Set', 'Configure an updates channel first with `/ownerupdates channel`.')],
        });
        return;
      }

      try {
        const { client } = await import('../../bot.js');
        const channel = await client.channels.fetch(config.updatesChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          const testEmbed = infoEmbed(
            '🚀 [TEST] Release Announcement — v1.0.0-test',
            'This is a test publication to verify channel delivery for `/updatelogs`.'
          );
          testEmbed.addFields([
            { name: '✨ New Features', value: '• Verified release announcement pipeline\n• Formatted embed cards' },
          ]);

          const payload: any = { embeds: [testEmbed] };
          if (config.updatesRoleId && config.updatesNotificationsEnabled !== false) {
            payload.content = `<@&${config.updatesRoleId}>`;
          }

          await (channel as any).send(payload);

          await interaction.editReply({
            embeds: [successEmbed('Test Sent', `Test update announcement dispatched to <#${config.updatesChannelId}>.`)],
          });
        }
      } catch (err: any) {
        await interaction.editReply({
          embeds: [infoEmbed('Delivery Failed', `Could not send to updates channel: ${err?.message}`)],
        });
      }
    }
  },
};
