import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../utils/redis.js';
import { client } from '../../bot.js';
import { mineflayerManager } from '../../mineflayer/client.js';
import { systemService } from '../../services/system.js';
import { isOwner, isAdmin } from '../../permissions/guard.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '../../config/constants.js';
import { COMMAND_CHOICES, buildCommandAvailabilityEmbed } from './commandsOwner.js';

export const ownerCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Master bot owner administrative controls')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Inspect bot internals, memory, Redis, DB, and Mineflayer')
    )
    .addSubcommand((sub) =>
      sub
        .setName('maintenance')
        .setDescription('Toggle global maintenance mode')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Enable or disable maintenance mode').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('reload').setDescription('Reload internal caches and configurations')
    )
    .addSubcommand((sub) =>
      sub.setName('shutdown').setDescription('Gracefully shutdown the bot process')
    )
    .addSubcommand((sub) =>
      sub.setName('servers').setDescription('List all Discord servers the bot is currently in')
    )
    .addSubcommand((sub) =>
      sub
        .setName('permissions')
        .setDescription('Inspect the permission level of a Discord user')
        .addUserOption((opt) => opt.setName('target').setDescription('The user to inspect').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist')
        .setDescription('Manage blacklisted Discord users')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'List Blacklisted', value: 'list' },
              { name: 'Add User to Blacklist', value: 'add' },
              { name: 'Remove User from Blacklist', value: 'remove' }
            )
        )
        .addUserOption((opt) =>
          opt.setName('target').setDescription('User to add or remove (not needed for list)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('announce')
        .setDescription('Broadcast an official announcement to all servers')
        .addStringOption((opt) =>
          opt.setName('message').setDescription('Announcement message').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Optional title').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('public-commands')
        .setDescription('Configure availability of public commands')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(false)
            .addChoices(
              { name: 'List All Commands Status', value: 'list' },
              { name: 'Enable Command', value: 'enable' },
              { name: 'Disable Command', value: 'disable' },
              { name: 'Enable All Commands', value: 'enable-all' },
              { name: 'Disable All Commands', value: 'disable-all' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('command')
            .setDescription('Specific command to configure')
            .setRequired(false)
            .addChoices(...COMMAND_CHOICES)
        )
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Legacy toggle for all public commands').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('owners')
        .setDescription('Manage multiple bot owners')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action: list, add, remove')
            .setRequired(true)
            .addChoices(
              { name: 'List All Bot Owners', value: 'list' },
              { name: 'Add Bot Co-Owner', value: 'add' },
              { name: 'Remove Bot Co-Owner', value: 'remove' }
            )
        )
        .addUserOption((opt) =>
          opt.setName('target').setDescription('Discord user to add or remove (not needed for list)').setRequired(false)
        )
    ),
  permission: PermissionLevel.OWNER,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'status') {
      const mem = process.memoryUsage();
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);

      // Redis check
      let redisStatus = '🔴 Offline';
      try {
        const ping = await redis.ping();
        if (ping === 'PONG') redisStatus = '🟢 Online (PONG)';
      } catch (_) {}

      // DB check
      let dbStatus = '🔴 Offline';
      let totalGuildsInDb = 0;
      let totalTracked = 0;
      let totalWatches = 0;
      try {
        totalGuildsInDb = await prisma.guildConfig.count();
        totalTracked = await prisma.trackedPlayer.count();
        totalWatches = await prisma.auctionWatch.count();
        dbStatus = '🟢 Connected (SQLite)';
      } catch (_) {}

      // Mineflayer check
      const mfStatus = mineflayerManager.getStatus();

      const embed = infoEmbed(
        'Bot System Diagnostics & Internals',
        `Overall runtime health and architecture metrics.`
      );

      embed.addFields([
        {
          name: '🖥️ System & Host',
          value:
            `• **Node.js**: \`${process.version}\`\n` +
            `• **Platform**: \`${process.platform} (${process.arch})\`\n` +
            `• **Memory (RSS)**: \`${(mem.rss / 1024 / 1024).toFixed(1)} MB\`\n` +
            `• **Heap Used**: \`${(mem.heapUsed / 1024 / 1024).toFixed(1)} / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB\`\n` +
            `• **Bot Uptime**: \`${hours}h ${minutes}m\`\n` +
            `• **Maintenance Mode**: ${systemService.isMaintenance() ? '⚠️ **ACTIVE**' : '🟢 Inactive'}`,
          inline: true,
        },
        {
          name: '🗄️ Storage & Caching',
          value:
            `• **Database**: ${dbStatus}\n` +
            `• **Redis Cache**: ${redisStatus}\n` +
            `• **Configured Guilds**: \`${totalGuildsInDb}\`\n` +
            `• **Tracked Players**: \`${totalTracked}\`\n` +
            `• **Auction Watches**: \`${totalWatches}\``,
          inline: true,
        },
        {
          name: '⛏️ Mineflayer Integration',
          value:
            `• **Connection**: ${mfStatus.connected ? '🟢 Connected' : mfStatus.connecting ? '🟡 Connecting' : '🔴 Disconnected'}\n` +
            `• **Bot Account**: \`${mfStatus.username || 'None'}\`\n` +
            `• **Server**: \`${mfStatus.server}\` (${mfStatus.inSkyPvP ? '⚔️ SkyPvP' : 'Hub'})\n` +
            `• **Last Error**: \`${mfStatus.lastError || 'None'}\``,
          inline: false,
        },
        {
          name: '🌐 Discord Gateway',
          value:
            `• **Connected Guilds**: \`${client.guilds.cache.size}\`\n` +
            `• **Cached Users**: \`${client.users.cache.size}\`\n` +
            `• **WebSocket Latency**: \`${client.ws.ping}ms\``,
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'maintenance') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await systemService.setMaintenance(enabled);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Maintenance Mode Updated',
            `Global maintenance mode has been **${enabled ? 'ACTIVATED' : 'DEACTIVATED'}**.\n` +
            (enabled
              ? 'Non-owner commands will now return a maintenance notice.'
              : 'All normal user and administrator commands are now operational.')
          ),
        ],
      });
    } else if (sub === 'reload') {
      // Reload system configs
      await interaction.editReply({
        embeds: [successEmbed('Reload Complete', 'Internal caches, permissions, and service handles reloaded.')],
      });
    } else if (sub === 'shutdown') {
      await interaction.editReply({
        embeds: [successEmbed('Shutting Down', 'Gracefully closing Mineflayer, Redis, and Discord connections...')],
      });

      setTimeout(async () => {
        try {
          mineflayerManager.disconnect();
          await prisma.$disconnect();
          await redis.quit();
          client.destroy();
        } finally {
          process.exit(0);
        }
      }, 1000);
    } else if (sub === 'servers') {
      const guilds = client.guilds.cache.map(
        (g) => `• **${g.name}** (\`${g.id}\`) — ${g.memberCount} members (Owner: <@${g.ownerId}>)`
      );

      const embed = infoEmbed(
        `Connected Guilds (${client.guilds.cache.size})`,
        guilds.length > 0 ? guilds.join('\n') : 'The bot is not currently in any servers.'
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'permissions') {
      const targetUser = interaction.options.getUser('target', true);
      const isOwnerUser = isOwner(targetUser.id);
      let isAdminUser = false;

      if (interaction.guild) {
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (member && isAdmin(member)) {
          isAdminUser = true;
        }
      }

      const level = isOwnerUser ? '👑 OWNER' : isAdminUser ? '🛡️ ADMIN' : '👤 PUBLIC';

      const embed = infoEmbed(
        `Permissions: ${targetUser.tag}`,
        `• **User ID**: \`${targetUser.id}\`\n` +
        `• **Evaluated Level**: **${level}**\n` +
        `• **Bot Owner**: ${isOwnerUser ? '✅ Yes' : '❌ No'}\n` +
        `• **Server Admin**: ${isAdminUser ? '✅ Yes' : '❌ No'}\n` +
        `• **Blacklisted**: ${systemService.isBlacklisted(targetUser.id) ? '🔴 Yes' : '🟢 No'}`
      );

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'blacklist') {
      const action = interaction.options.getString('action', true);
      const targetUser = interaction.options.getUser('target');

      if (action === 'list') {
        const list = systemService.getBlacklisted();
        const embed = infoEmbed(
          `Blacklisted Users (${list.length})`,
          list.length > 0
            ? list.map((id) => `• <@${id}> (\`${id}\`)`).join('\n')
            : 'No users are currently blacklisted.'
        );
        await interaction.editReply({ embeds: [embed] });
      } else if (action === 'add') {
        if (!targetUser) {
          await interaction.editReply({ embeds: [errorEmbed('User Required', 'Specify a user to blacklist.')] });
          return;
        }
        if (isOwner(targetUser.id)) {
          await interaction.editReply({ embeds: [errorEmbed('Action Denied', 'The bot owner cannot be blacklisted.')] });
          return;
        }

        await systemService.addBlacklist(targetUser.id);
        await interaction.editReply({
          embeds: [successEmbed('User Blacklisted', `User <@${targetUser.id}> has been blacklisted from using the bot.`)],
        });
      } else if (action === 'remove') {
        if (!targetUser) {
          await interaction.editReply({ embeds: [errorEmbed('User Required', 'Specify a user to unblacklist.')] });
          return;
        }

        await systemService.removeBlacklist(targetUser.id);
        await interaction.editReply({
          embeds: [successEmbed('User Unblacklisted', `User <@${targetUser.id}> has been removed from the blacklist.`)],
        });
      }
    } else if (sub === 'announce') {
      const message = interaction.options.getString('message', true);
      const title = interaction.options.getString('title') || '📢 SkyPvP Utils Global Announcement';

      const configs = await prisma.guildConfig.findMany({
        where: {
          OR: [{ updatesChannelId: { not: null } }, { eventChannelId: { not: null } }],
        },
      });

      let sentCount = 0;
      const embed = infoEmbed(title, message);
      embed.setColor(COLORS.INFO);
      embed.setFooter({ text: 'Official SkyPvP Utils Announcement' });
      embed.setTimestamp();

      for (const cfg of configs) {
        const chId = cfg.updatesChannelId || cfg.eventChannelId;
        if (!chId) continue;
        try {
          const ch = await client.channels.fetch(chId);
          if (ch && ch.isTextBased() && 'send' in ch) {
            await (ch as any).send({ embeds: [embed] });
            sentCount++;
          }
        } catch (_) {}
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Announcement Broadcasted',
            `Successfully delivered announcement to **${sentCount}** server channels.`
          ),
        ],
      });
    } else if (sub === 'public-commands') {
      const action = interaction.options.getString('action');
      const commandArg = interaction.options.getString('command');
      const enabledOption = interaction.options.getBoolean('enabled');
      const guildId = interaction.guildId || 'global';

      if (action === 'list' || (!action && !commandArg && enabledOption === null)) {
        const embed = buildCommandAvailabilityEmbed(guildId, interaction.guild?.name);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (action === 'enable' && commandArg) {
        if (commandArg === 'all') {
          await systemService.setAllCommandsAvailability(true, guildId);
        } else {
          await systemService.setCommandAvailability(commandArg, true, guildId);
        }
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Public Commands Updated',
              `Command \`/${commandArg}\` is now **ENABLED** for public users in this server.`
            ),
          ],
        });
        return;
      }

      if (action === 'disable' && commandArg) {
        if (commandArg === 'all') {
          await systemService.setAllCommandsAvailability(false, guildId);
        } else {
          await systemService.setCommandAvailability(commandArg, false, guildId);
        }
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Public Commands Updated',
              `Command \`/${commandArg}\` is now **DISABLED** for public users in this server.`
            ),
          ],
        });
        return;
      }

      if (action === 'enable-all') {
        await systemService.setAllCommandsAvailability(true, guildId);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Public Commands Updated',
              `All public commands are now **ENABLED** for this server.`
            ),
          ],
        });
        return;
      }

      if (action === 'disable-all') {
        await systemService.setAllCommandsAvailability(false, guildId);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Public Commands Updated',
              `All public commands are now **DISABLED** for this server.`
            ),
          ],
        });
        return;
      }

      // Legacy toggle
      const enabled = enabledOption ?? true;
      await prisma.publicCommandSettings.upsert({
        where: { guildId },
        update: { enabled },
        create: { guildId, enabled },
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Public Commands Setting Updated',
            `Public commands are now **${enabled ? 'ENABLED' : 'DISABLED'}** for this server.\n` +
            `*(Admin and Owner commands remain fully operational).*`
          ),
        ],
      });
    } else if (sub === 'owners') {
      const action = interaction.options.getString('action', true);
      const targetUser = interaction.options.getUser('target');

      if (action === 'list') {
        const configured = systemService.getConfiguredOwners();
        const dynamic = systemService.getDynamicOwners();
        const all = systemService.getAllOwners();

        const embed = infoEmbed(
          '👑 Bot Owners & Administrative Access',
          `Viewing all Discord users with full Bot Owner privileges.`
        );
        embed.setColor(COLORS.INFO);

        const configStr =
          configured.length > 0
            ? configured.map((id) => `• <@${id}> (\`${id}\`)`).join('\n')
            : '*None configured*';

        const dynamicStr =
          dynamic.length > 0
            ? dynamic.map((id) => `• <@${id}> (\`${id}\`)`).join('\n')
            : '*No additional co-owners added*';

        embed.addFields([
          { name: '🔒 Primary Owners (Configured in .env)', value: configStr, inline: false },
          { name: '⭐ Co-Owners (Dynamically Added)', value: dynamicStr, inline: false },
        ]);

        embed.setFooter({ text: `Total Owners: ${all.length} user(s)` });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (action === 'add') {
        if (!targetUser) {
          await interaction.editReply({
            embeds: [errorEmbed('User Required', 'Please specify a target user to add as bot owner.')],
          });
          return;
        }

        if (systemService.isOwner(targetUser.id)) {
          await interaction.editReply({
            embeds: [infoEmbed('Already Owner', `<@${targetUser.id}> is already a bot owner.`)],
          });
          return;
        }

        await systemService.addOwner(targetUser.id);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Bot Owner Added',
              `Successfully granted full Bot Owner permissions to <@${targetUser.id}> (\`${targetUser.id}\`).\n` +
                `*(They now have access to all owner commands, maintenance mode, and bot controls).*`
            ),
          ],
        });
        return;
      }

      if (action === 'remove') {
        if (!targetUser) {
          await interaction.editReply({
            embeds: [errorEmbed('User Required', 'Please specify a target user to remove from bot owners.')],
          });
          return;
        }

        if (systemService.getConfiguredOwners().includes(targetUser.id)) {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'Cannot Remove Primary Owner',
                `<@${targetUser.id}> is configured as a primary owner in the bot environment (.env) and cannot be removed dynamically.`
              ),
            ],
          });
          return;
        }

        if (!systemService.isOwner(targetUser.id)) {
          await interaction.editReply({
            embeds: [errorEmbed('Not An Owner', `<@${targetUser.id}> is not currently a bot owner.`)],
          });
          return;
        }

        await systemService.removeOwner(targetUser.id);
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Bot Owner Removed',
              `Successfully revoked Bot Owner permissions from <@${targetUser.id}> (\`${targetUser.id}\`).`
            ),
          ],
        });
        return;
      }
    }
  },
};
