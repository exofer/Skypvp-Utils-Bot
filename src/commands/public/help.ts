import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { infoEmbed } from '../../utils/embeds.js';
import { isOwner, isAdmin } from '../../permissions/guard.js';

export const helpCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display available commands and information'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    const embed = infoEmbed(
      'SkyPvP Utils — Command Guide',
      'The definitive Discord utility bot for PikaNetwork SkyPvP.'
    );

    embed.addFields([
      {
        name: '👤 Player & Stats',
        value:
          '`/profile <username>` — View general network profile & ranks\n' +
          '`/stats <username> [interval]` — SkyPvP kills, deaths, KDR, streaks\n' +
          '`/compare <p1> <p2>` — Head-to-head stat comparison\n' +
          '`/leaderboard [stat] [interval]` — Top ranked players\n' +
          '`/fights <username>` — Recent PvP fights and weapon usage\n' +
          '`/killfeed` — Network-wide live SkyPvP kill activity\n' +
          '`/track <add|remove|list|info>` — Player snapshot tracking',
        inline: false,
      },
      {
        name: '🏷️ Auction System',
        value:
          '`/auction search <item>` — Search detected auction listings\n' +
          '`/auction watch <item> [max_price]` — Alert when an item is listed\n' +
          '`/auction watches` — View and manage your active watches\n' +
          '`/auction alerts <on|off>` — Toggle personal DM alerts',
        inline: false,
      },
      {
        name: '⚔️ Events & Chat',
        value:
          '`/events` — View active SkyPvP and tournament events\n' +
          '`/chat status` — Status of the Minecraft chat bridge\n' +
          '`/ping` — Check bot and API latency',
        inline: false,
      },
    ]);

    const member = interaction.member;
    const userId = interaction.user.id;

    if (member && (isAdmin(member as any) || isOwner(userId))) {
      embed.addFields({
        name: '⚙️ Admin Commands',
        value:
          '`/setup` — Configure server notification channels\n' +
          '`/config view` — Inspect current server setup\n' +
          '`/auction feed <toggle|test>` — Manage public auction feed channel',
        inline: false,
      });
    }

    if (isOwner(userId)) {
      embed.addFields({
        name: '👑 Owner Commands',
        value:
          '`/owner status` — View bot internals, Redis, and workers\n' +
          '`/owner settings public-commands <enable|disable>` — Global public toggle\n' +
          '`/owner account <configure|status|test|reconnect>` — Mineflayer bot setup\n' +
          '`/owner logs <setup|view|test|toggle>` — Configure 13-category logging\n' +
          '`/updatelogs` — Create and publish release announcements',
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
