import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PermissionLevel } from '../../permissions/levels.js';
import type { CommandModule } from '../../types/index.js';
import { eventProvider } from '../../providers/event.js';
import { getEvents } from '../../api/endpoints.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';

export const eventsCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('View live SkyPvP events and scheduled network tournaments'),
  permission: PermissionLevel.PUBLIC,
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    try {
      const liveEvents = eventProvider.getEventStates();
      let networkTournaments: any[] = [];
      try {
        networkTournaments = await getEvents(5);
      } catch (_) {}

      const embed = infoEmbed(
        '🏆 SkyPvP & Network Events',
        'Current status of live SkyPvP events and upcoming network tournaments.'
      );

      // SkyPvP In-Game Events
      const pvpLines = liveEvents.map((e) => {
        const icon = e.active ? '🟢 **ACTIVE**' : '⚪ Inactive';
        return `• **${e.name}**: ${icon}`;
      });

      embed.addFields({
        name: '⚔️ SkyPvP Game Events',
        value: pvpLines.join('\n'),
        inline: false,
      });

      // Network Tournament Events
      if (networkTournaments && networkTournaments.length > 0) {
        const tourneyLines = networkTournaments.slice(0, 5).map((t) => {
          const name = t.name || t.type || 'Tournament';
          const time = t.time ? `<t:${Math.floor(t.time / 1000)}:R>` : 'Scheduled';
          return `• **${name}** — ${time}`;
        });
        embed.addFields({
          name: '🎮 PikaNetwork Tournaments',
          value: tourneyLines.join('\n'),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Events Error', err.message || 'Failed to load events.')],
      });
    }
  },
};
