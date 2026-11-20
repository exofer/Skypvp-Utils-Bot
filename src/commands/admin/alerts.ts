import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { client } from '../../bot.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';

export const alertsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('Test server alert notifications and role pings')
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test notification to verify channels and role pings')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Notification category to test')
            .setRequired(true)
            .addChoices(
              { name: 'SkyPvP Events (Floral Fortune / KoTL etc.)', value: 'EVENTS' },
              { name: 'KOTH Alerts (East / West KOTH)', value: 'KOTH' },
              { name: 'Stronghold Alerts', value: 'STRONGHOLD' },
              { name: 'Outpost Board', value: 'OUTPOST' },
              { name: 'Auction Feed', value: 'AUCTION' }
            )
        )
    ),
  permission: PermissionLevel.ADMIN,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'test') {
      const category = interaction.options.getString('category', true);
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });

      if (!config) {
        await interaction.editReply({
          embeds: [errorEmbed('Configuration Missing', 'No server configuration found. Run `/setup` first.')],
        });
        return;
      }

      let channelId: string | null = null;
      let roleId: string | null = null;
      let testTitle = '';
      let testDesc = '';
      let embedColor: number = COLORS.INFO;

      switch (category) {
        case 'EVENTS':
          channelId = config.eventChannelId;
          roleId = config.floralFortuneRoleId;
          testTitle = '🎉 [TEST] SkyPvP Event Starting Soon';
          testDesc = '**Floral Fortune** starts in 5 minutes! Gather around the warzone flowers.';
          embedColor = COLORS.EVENT;
          break;
        case 'KOTH':
          channelId = config.kothChannelId;
          roleId = config.kothRoleId;
          testTitle = '⚔️ [TEST] King of the Hill (East KOTH)';
          testDesc = 'East KOTH has started! Capture the hill to earn loot and team glory.';
          embedColor = COLORS.KOTH;
          break;
        case 'STRONGHOLD':
          channelId = config.strongholdChannelId;
          roleId = config.strongholdRoleId;
          testTitle = '🏰 [TEST] Stronghold Capture Underway';
          testDesc = 'The Stronghold is contested! Secure the portal frames to claim control.';
          embedColor = COLORS.STRONGHOLD;
          break;
        case 'OUTPOST':
          channelId = config.outpostChannelId;
          testTitle = '🛡️ [TEST] Outpost Status Inspection';
          testDesc = 'All 4 Warzone Outposts monitored live: Resistance, Damage, Luckyblocks, Souls.';
          embedColor = COLORS.OUTPOST;
          break;
        case 'AUCTION':
          channelId = config.auctionFeedChannelId;
          testTitle = '🏷️ [TEST] Auction House Listing';
          testDesc = 'Listing: **Diamond Sword** | Seller: `PikaPlayer` | Price: `$100,000`';
          embedColor = COLORS.AUCTION;
          break;
      }

      if (!channelId) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              'Channel Not Configured',
              `The destination channel for **${category}** has not been configured yet.\nSet it using \`/config channel\` or \`/setup\`.`
            ),
          ],
        });
        return;
      }

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || !('send' in channel)) {
          await interaction.editReply({
            embeds: [errorEmbed('Invalid Channel', `Channel <#${channelId}> cannot receive messages.`)],
          });
          return;
        }

        const embed = infoEmbed(testTitle, testDesc);
        embed.setColor(embedColor);
        embed.setFooter({ text: 'SkyPvP Utils • Test Alert' });
        embed.setTimestamp();

        const pingContent = roleId && category !== 'OUTPOST' ? `<@&${roleId}>` : undefined;

        await (channel as any).send({
          content: pingContent,
          embeds: [embed],
        });

        await interaction.editReply({
          embeds: [
            successEmbed(
              'Test Alert Sent',
              `Test notification for **${category}** sent successfully to <#${channelId}>.` +
              (roleId ? `\n• Mentioned Role: <@&${roleId}>` : '\n• Role Ping: None')
            ),
          ],
        });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [errorEmbed('Test Failed', `Could not dispatch message to channel: ${err?.message}`)],
        });
      }
    }
  },
};
