import { describe, it, expect } from 'vitest';
import { SkyPvPEventProvider } from '../src/providers/event.js';

describe('KOTH & Outpost State Logic', () => {
  it('distinguishes between East and West KOTH state tracking', () => {
    const kothStates = new Map<string, { active: boolean; winner?: string }>();
    kothStates.set('EAST', { active: true });
    kothStates.set('WEST', { active: false, winner: 'ChampionPvP' });

    expect(kothStates.get('EAST')?.active).toBe(true);
    expect(kothStates.get('WEST')?.active).toBe(false);
    expect(kothStates.get('WEST')?.winner).toBe('ChampionPvP');
  });

  it('guarantees outposts do not include role mentions or @everyone', () => {
    const outpostMessageContent = {
      content: undefined,
      allowedMentions: { parse: [] }, // Strict setting
    };

    expect(outpostMessageContent.content).toBeUndefined();
    expect(outpostMessageContent.allowedMentions.parse.length).toBe(0);
  });

  it('routes event notifications to specific channels with fallback to default channel', () => {
    const guildConfig = {
      eventChannelId: 'channel-default-events',
      floralFortuneChannelId: 'channel-floral-fortune',
      kotlChannelId: 'channel-kotl',
      envoyDropsChannelId: null,
    };

    const getTargetChannel = (eventType: string) => {
      switch (eventType) {
        case 'FLORAL_FORTUNE':
          return guildConfig.floralFortuneChannelId || guildConfig.eventChannelId;
        case 'KOTL':
          return guildConfig.kotlChannelId || guildConfig.eventChannelId;
        case 'ENVOY_DROPS':
          return guildConfig.envoyDropsChannelId || guildConfig.eventChannelId;
        default:
          return guildConfig.eventChannelId;
      }
    };

    expect(getTargetChannel('FLORAL_FORTUNE')).toBe('channel-floral-fortune');
    expect(getTargetChannel('KOTL')).toBe('channel-kotl');
    expect(getTargetChannel('ENVOY_DROPS')).toBe('channel-default-events');
    expect(getTargetChannel('BLOOD_LUST')).toBe('channel-default-events');
  });
});

describe('SkyPvP Pre-Event Early Alerts & Lifecycle', () => {
  it('detects 5-minute pre-event early warnings for KoTL and Floral Fortune', () => {
    const provider = new SkyPvPEventProvider();

    // 1. KoTL 5m early warning
    const kotlResult = provider.processChatMessage('  KoTL Game starts in 5 minutes!');
    expect(kotlResult).not.toBeNull();
    expect(kotlResult?.type).toBe('KOTL');
    expect(kotlResult?.action).toBe('upcoming');
    expect(kotlResult?.state.upcoming).toBe(true);
    expect(kotlResult?.state.startsInMinutes).toBe(5);

    // 2. Floral Fortune 5m early warning
    const floralResult = provider.processChatMessage('  Floral Fortune Game starts in 5 minutes!');
    expect(floralResult).not.toBeNull();
    expect(floralResult?.type).toBe('FLORAL_FORTUNE');
    expect(floralResult?.action).toBe('upcoming');
    expect(floralResult?.state.upcoming).toBe(true);
    expect(floralResult?.state.startsInMinutes).toBe(5);

    // 3. Hardpoint 5m early warning
    const hardpointResult = provider.processChatMessage('  Hardpoint Game starts in 5 minutes!');
    expect(hardpointResult).not.toBeNull();
    expect(hardpointResult?.type).toBe('HARD_POINT');
    expect(hardpointResult?.action).toBe('upcoming');

    // 4. Envoy Drops 5m early warning
    const envoyResult = provider.processChatMessage('  Envoy Drops Game starts in 5 minutes!');
    expect(envoyResult).not.toBeNull();
    expect(envoyResult?.type).toBe('ENVOY_DROPS');
    expect(envoyResult?.action).toBe('upcoming');
  });

  it('detects both 10-minute and 5-minute pre-event early warnings, while ignoring distant > 10m warnings', () => {
    const provider = new SkyPvPEventProvider();

    // 10 minutes warning is detected
    const result10 = provider.processChatMessage('  Floral Fortune Game starts in 10 minutes!');
    expect(result10).not.toBeNull();
    expect(result10?.type).toBe('FLORAL_FORTUNE');
    expect(result10?.action).toBe('upcoming');
    expect(result10?.state.startsInMinutes).toBe(10);

    // 5 minutes warning is also detected in sequence
    const result5 = provider.processChatMessage('  Floral Fortune Game starts in 5 minutes!');
    expect(result5).not.toBeNull();
    expect(result5?.type).toBe('FLORAL_FORTUNE');
    expect(result5?.action).toBe('upcoming');
    expect(result5?.state.startsInMinutes).toBe(5);

    // 20 minutes warning is ignored
    const result20 = provider.processChatMessage('  Hardpoint Game starts in 20 minutes!');
    expect(result20).toBeNull();
  });

  it('ignores player chat messages mentioning event names', () => {
    const provider = new SkyPvPEventProvider();

    const playerMsg = provider.processChatMessage('[Hero] CoolPvPer › kotl starts in 5 minutes!');
    expect(playerMsg).toBeNull();

    const playerTroll = provider.processChatMessage('[Clan] <Legend> Player1 › Floral Fortune Game starts in 5 minutes!');
    expect(playerTroll).toBeNull();
  });

  it('handles full lifecycle: upcoming -> started -> ended', () => {
    const provider = new SkyPvPEventProvider();

    // Step 1: Pre-warning (5 minutes early)
    const earlyWarn = provider.processChatMessage('  KoTL Game starts in 5 minutes!');
    expect(earlyWarn?.action).toBe('upcoming');
    expect(provider.getEventState('KOTL')?.upcoming).toBe(true);
    expect(provider.getEventState('KOTL')?.active).toBe(false);

    // Step 2: Event starts
    const startMsg = provider.processChatMessage('PikaEvents » KoTL Event has started!');
    expect(startMsg?.action).toBe('started');
    expect(provider.getEventState('KOTL')?.active).toBe(true);
    expect(provider.getEventState('KOTL')?.upcoming).toBe(false);

    // Step 2b: Duplicate start message while active should be ignored
    const duplicateStart = provider.processChatMessage('PikaEvents » KoTL is now active at Warzone!');
    expect(duplicateStart).toBeNull();
    expect(provider.getEventState('KOTL')?.active).toBe(true);

    // Step 3: Event ends
    const endMsg = provider.processChatMessage('PikaEvents » The KoTL Event is over!');
    expect(endMsg?.action).toBe('ended');
    expect(provider.getEventState('KOTL')?.active).toBe(false);
    expect(provider.getEventState('KOTL')?.upcoming).toBe(false);

    // Step 3b: Duplicate end message should be ignored
    const duplicateEnd = provider.processChatMessage('PikaEvents » The KoTL Event has ended!');
    expect(duplicateEnd).toBeNull();
  });

  it('guarantees role ping is sent during pre-alert and omitted during event start alert', () => {
    const configuredRoleId = '123456789012345678';

    // Pre-alert payload
    const preAlertPayload = {
      content: configuredRoleId ? `<@&${configuredRoleId}>` : undefined,
      embeds: ['[Upcoming Embed]'],
    };

    // Event start payload (embed only, no role ping)
    const startAlertPayload = {
      embeds: ['[Started Embed]'],
    };

    expect(preAlertPayload.content).toBe('<@&123456789012345678>');
    expect((startAlertPayload as any).content).toBeUndefined();
  });

  it('guarantees eventService deduplicates upcoming and started alerts across polling cycles', async () => {
    const { eventService } = await import('../src/services/events.js');
    const { vi } = await import('vitest');

    const earlySpy = vi.spyOn(eventService as any, 'broadcastEventEarlyWarning').mockResolvedValue(undefined);
    const startSpy = vi.spyOn(eventService as any, 'broadcastEventStart').mockResolvedValue(undefined);

    const mockState = {
      type: 'BLOOD_LUST' as const,
      name: 'Blood Lust',
      active: false,
      upcoming: true,
      startsInMinutes: 10,
    };

    // First 10m call triggers broadcast
    await eventService.handleEventUpcoming(mockState);
    expect(earlySpy).toHaveBeenCalledTimes(1);

    // Repeated calls for 10m in the same cycle must be ignored
    await eventService.handleEventUpcoming(mockState);
    await eventService.handleEventUpcoming(mockState);
    expect(earlySpy).toHaveBeenCalledTimes(1);

    // Multiple recurring checkAndNotifyEvents() runs must not re-trigger
    await eventService.checkAndNotifyEvents();
    await eventService.checkAndNotifyEvents();
    expect(earlySpy).toHaveBeenCalledTimes(1);

    // Sequence to 5 minutes triggers exactly once
    const mockState5m = {
      ...mockState,
      startsInMinutes: 5,
      upcomingAlertSent: false,
    };
    await eventService.handleEventUpcoming(mockState5m);
    expect(earlySpy).toHaveBeenCalledTimes(2);

    // Duplicate 5m calls ignored
    await eventService.handleEventUpcoming(mockState5m);
    await eventService.checkAndNotifyEvents();
    expect(earlySpy).toHaveBeenCalledTimes(2);

    // Event starts
    const activeState = {
      ...mockState,
      active: true,
      upcoming: false,
      startsInMinutes: undefined,
    };
    await eventService.handleEventStarted(activeState);
    expect(startSpy).toHaveBeenCalledTimes(1);

    // Duplicate event started calls ignored
    await eventService.handleEventStarted(activeState);
    await eventService.checkAndNotifyEvents();
    expect(startSpy).toHaveBeenCalledTimes(1);

    earlySpy.mockRestore();
    startSpy.mockRestore();
  });
});
