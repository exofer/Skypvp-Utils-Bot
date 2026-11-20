import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { infoEmbed } from '../../utils/embeds.js';
import { isOwner, isAdmin } from '../../permissions/guard.js';

export const helpCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display available commands and documentation for SkyPvP Utils'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const embed = infoEmbed(
      'SkyPvP Utils — Command Guide',
      '⚔️ The definitive Discord utility bot for **PikaNetwork SkyPvP**.\n' +
        'Real-time warzone monitoring, combat tracking, and competitive clan telemetry.\n\n' +
        '✨ **Made by Exhaus (@xhaus.eta)**'
    );

    embed.addFields([
      {
        name: '👤 Player & Combat Features',
        value:
          '`/player <username>` — Comprehensive profile & SkyPvP combat summary\n' +
          '`/profile <username>` — View general network profile & ranks\n' +
          '`/stats <username> [interval]` — SkyPvP kills, deaths, KDR, streaks, balance\n' +
          '`/bal <username>` — Check in-game balance and baltop ranking\n' +
          '`/baltop [page]` — View richest players leaderboard (/baltops)\n' +
          '`/compare <p1> <p2>` — Head-to-head stat comparison\n' +
          '`/leaderboard [stat] [interval]` — Top ranked players (kills, balance, etc.)\n' +
          '`/fights <username>` — Recent PvP fights and weapon usage\n' +
          '`/killfeed` — Network-wide live SkyPvP kill activity\n' +
          '`/track <add|remove|list|info>` — Player snapshot tracking',
        inline: false,
      },
      {
        name: '🏷️ Auction System',
        value:
          '`/auction search <item> [currency]` — Search detected auction listings\n' +
          '`/auction watch <item> [max_price] [currency]` — Alert when an item is listed (Money/Gold)\n' +
          '`/auction watches` — View and manage your active watches\n' +
          '`/auction watchlist` — Alias for viewing your active watches\n' +
          '`/auction edit <watch_id> [item] [max_price] [currency]` — Update an existing watch\n' +
          '`/auction pause|resume|delete <watch_id>` — Watch state management\n' +
          '`/auction alerts <on|off>` — Toggle personal DM alerts',
        inline: false,
      },
      {
        name: '🛡️ Teams & Clans',
        value:
          '`/team tops [page]` — Top ranked SkyPvP teams leaderboard\n' +
          '`/team info <name>` — Detailed team roster, statistics, and rank',
        inline: false,
      },
      {
        name: '⚔️ Events & Utilities',
        value:
          '`/events` — View active SkyPvP and tournament events\n' +
          '`/chatstatus` — Status of the one-way Minecraft public chat bridge\n' +
          '`/ping` — Independent latency telemetry (Gateway, REST, DB, Redis, API)',
        inline: false,
      },
    ]);

    const member = interaction.member;
    const userId = interaction.user.id;

    if (member && (isAdmin(member as any) || isOwner(userId))) {
      embed.addFields({
        name: '⚙️ Admin Commands',
        value:
          '`/setup` — Quick server setup overview and configured channels\n' +
          '`/auctionfeed <view|channel|toggle|test>` — Manage public auction feed channel\n' +
          '`/config <view|channel|roles|alerts|chat>` — Server alerts configuration\n' +
          '`/alerts test <category>` — Send test notification to verify channels/roles\n' +
          '`/tracking settings` — View guild player tracking limits\n' +
          '`/server stats` — View server & bot performance metrics',
        inline: false,
      });
    }

    if (isOwner(userId)) {
      embed.addFields({
        name: '👑 Owner Commands',
        value:
          '`/owner <status|maintenance|reload|shutdown|servers|permissions|blacklist|announce|public-commands|owners>`\n' +
          '`/owneraccount <status|connect|disconnect|send|reconnect|configure|remove>` — Mineflayer setup\n' +
          '`/auctionowner <status|scrape|source>` — Auction ingestion controls\n' +
          '`/ownerevents <channel|clear-channel|role|toggle>` — SkyPvP event alerts setup\n' +
          '`/ownerkoth <channel|role|toggle>` — Shared KOTH role & channel setup\n' +
          '`/ownerstronghold <channel|role|toggle>` — Stronghold alerts setup\n' +
          '`/owneroutpost <channel|interval|toggle|refresh|inspect>` — Outpost monitor setup\n' +
          '`/ownerchat <channel|style|toggle>` — One-way Minecraft chat bridge\n' +
          '`/ownerlogs <level|view|export|channel|remove|toggle|test>` — 13-category audit logging\n' +
          '`/ownersettings <view|set|reset|public-commands>` — Global bot settings\n' +
          '`/ownerupdates <channel|role|toggle|view|remove|test>` — Destination channel for release notes\n' +
          '`/updatelogs <post|list>` — Create and publish release announcements\n' +
          '`/ownercommands <list|enable|disable|set>` — Public command availability controls\n' +
          '`/ownerowners <list|add|remove>` — Multi-owner management',
        inline: false,
      });
    }

    embed.setFooter({
      text: 'SkyPvP Utils • Made by Exhaus (@xhaus.eta)',
    });

    await interaction.reply({ embeds: [embed] });
  },
};
