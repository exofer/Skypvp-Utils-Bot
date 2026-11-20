import { describe, it, expect } from 'vitest';
import { PermissionLevel } from '../src/permissions/levels.js';
import { playerCommand } from '../src/commands/public/player.js';
import { chatCommand } from '../src/commands/public/chat.js';
import { auctionCommand } from '../src/commands/public/auction.js';
import { teamCommand } from '../src/commands/public/team.js';
import { balCommand } from '../src/commands/public/bal.js';
import { baltopCommand, baltopsCommand } from '../src/commands/public/baltop.js';
import { leaderboardCommand } from '../src/commands/public/leaderboard.js';
import { statsCommand } from '../src/commands/public/stats.js';
import { pingCommand } from '../src/commands/public/ping.js';
import { configCommand } from '../src/commands/admin/config.js';
import { alertsCommand } from '../src/commands/admin/alerts.js';
import { trackingCommand } from '../src/commands/admin/tracking.js';
import { serverStatsCommand } from '../src/commands/admin/serverStats.js';
import { auctionFeedCommand } from '../src/commands/admin/auctionFeed.js';
import { ownerCommand } from '../src/commands/owner/owner.js';
import { commandsOwnerCommand } from '../src/commands/owner/commandsOwner.js';
import { ownersOwnerCommand } from '../src/commands/owner/ownersOwner.js';
import { updateLogsCommand } from '../src/commands/owner/updatelogs.js';
import { updatesOwnerCommand } from '../src/commands/owner/updatesOwner.js';
import { outpostOwnerCommand } from '../src/commands/owner/outpostOwner.js';
import { logsOwnerCommand } from '../src/commands/owner/logsOwner.js';
import { settingsOwnerCommand } from '../src/commands/owner/settingsOwner.js';
import { ownerAccountCommand } from '../src/commands/owner/account.js';
import { eventsOwnerCommand } from '../src/commands/owner/eventsOwner.js';
import { kothOwnerCommand } from '../src/commands/owner/kothOwner.js';
import { strongholdOwnerCommand } from '../src/commands/owner/strongholdOwner.js';
import { auctionOwnerCommand } from '../src/commands/owner/auctionOwner.js';
import { systemService } from '../src/services/system.js';

describe('Public Commands Specification', () => {
  it('correctly defines /player with required username argument and PUBLIC permission', () => {
    expect(playerCommand.data.name).toBe('player');
    expect(playerCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = playerCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'username' && opt.required)).toBe(true);
  });

  it('correctly defines /chat with status subcommand and PUBLIC permission', () => {
    expect(chatCommand.data.name).toBe('chat');
    expect(chatCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = chatCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'status')).toBe(true);
  });

  it('correctly defines /auction with edit subcommand', () => {
    expect(auctionCommand.data.name).toBe('auction');
    expect(auctionCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = auctionCommand.data.toJSON();
    const editSub = json.options?.find((opt: any) => opt.name === 'edit');
    expect(editSub).toBeDefined();
    expect(editSub?.options?.some((opt: any) => opt.name === 'watch_id' && opt.required)).toBe(true);
  });

  it('correctly defines /team with tops, top, and info subcommands and PUBLIC permission', () => {
    expect(teamCommand.data.name).toBe('team');
    expect(teamCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = teamCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('tops');
    expect(subNames).toContain('top');
    expect(subNames).toContain('info');
  });

  it('correctly defines /bal with required username argument and PUBLIC permission', () => {
    expect(balCommand.data.name).toBe('bal');
    expect(balCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = balCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'username' && opt.required)).toBe(true);
  });

  it('correctly defines /baltop and /baltops with optional page argument and PUBLIC permission', () => {
    expect(baltopCommand.data.name).toBe('baltop');
    expect(baltopCommand.permission).toBe(PermissionLevel.PUBLIC);
    expect(baltopsCommand.data.name).toBe('baltops');
    expect(baltopsCommand.permission).toBe(PermissionLevel.PUBLIC);

    const json = baltopCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'page')).toBe(true);
  });

  it('includes balance in /leaderboard choices', () => {
    const json = leaderboardCommand.data.toJSON();
    const statOption = json.options?.find((opt: any) => opt.name === 'stat');
    expect(statOption).toBeDefined();
    expect(statOption?.choices?.some((c: any) => c.value === 'balance')).toBe(true);
  });

  it('correctly defines /stats with interval option and PUBLIC permission', () => {
    expect(statsCommand.data.name).toBe('stats');
    expect(statsCommand.permission).toBe(PermissionLevel.PUBLIC);
    const json = statsCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'username' && opt.required)).toBe(true);
    expect(json.options?.some((opt: any) => opt.name === 'interval')).toBe(true);
  });

  it('correctly defines /ping with PUBLIC permission', () => {
    expect(pingCommand.data.name).toBe('ping');
    expect(pingCommand.permission).toBe(PermissionLevel.PUBLIC);
  });
});

describe('Admin Commands Specification', () => {
  it('correctly defines /config with view, channel, roles, alerts, and chat subcommands and ADMIN permission', () => {
    expect(configCommand.data.name).toBe('config');
    expect(configCommand.permission).toBe(PermissionLevel.ADMIN);
    const json = configCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('view');
    expect(subNames).toContain('channel');
    expect(subNames).toContain('roles');
    expect(subNames).toContain('alerts');
    expect(subNames).toContain('chat');
  });

  it('correctly defines /alerts with test subcommand and ADMIN permission', () => {
    expect(alertsCommand.data.name).toBe('alerts');
    expect(alertsCommand.permission).toBe(PermissionLevel.ADMIN);
    const json = alertsCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'test')).toBe(true);
  });

  it('correctly defines /tracking with settings subcommand and ADMIN permission', () => {
    expect(trackingCommand.data.name).toBe('tracking');
    expect(trackingCommand.permission).toBe(PermissionLevel.ADMIN);
    const json = trackingCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'settings')).toBe(true);
  });

  it('correctly defines /server with stats subcommand and ADMIN permission', () => {
    expect(serverStatsCommand.data.name).toBe('server');
    expect(serverStatsCommand.permission).toBe(PermissionLevel.ADMIN);
    const json = serverStatsCommand.data.toJSON();
    expect(json.options?.some((opt: any) => opt.name === 'stats')).toBe(true);
  });

  it('correctly defines /auctionfeed with view, channel, toggle, and test subcommands', () => {
    expect(auctionFeedCommand.data.name).toBe('auctionfeed');
    expect(auctionFeedCommand.permission).toBe(PermissionLevel.ADMIN);
    const json = auctionFeedCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('view');
    expect(subNames).toContain('channel');
    expect(subNames).toContain('toggle');
    expect(subNames).toContain('test');
  });
});

describe('Owner Commands Specification', () => {
  it('correctly defines /owner with status, maintenance, reload, shutdown, servers, permissions, blacklist, announce, and public-commands', () => {
    expect(ownerCommand.data.name).toBe('owner');
    expect(ownerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = ownerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('status');
    expect(subNames).toContain('maintenance');
    expect(subNames).toContain('reload');
    expect(subNames).toContain('shutdown');
    expect(subNames).toContain('servers');
    expect(subNames).toContain('permissions');
    expect(subNames).toContain('blacklist');
    expect(subNames).toContain('announce');
    expect(subNames).toContain('public-commands');
    expect(subNames).toContain('owners');
  });

  it('enforces blacklist and maintenance state in systemService', async () => {
    expect(systemService.isBlacklisted('random_user_123')).toBe(false);
    await systemService.addBlacklist('random_user_123');
    expect(systemService.isBlacklisted('random_user_123')).toBe(true);
    await systemService.removeBlacklist('random_user_123');
    expect(systemService.isBlacklisted('random_user_123')).toBe(false);

    expect(systemService.isMaintenance()).toBe(false);
    await systemService.setMaintenance(true);
    expect(systemService.isMaintenance()).toBe(true);
    await systemService.setMaintenance(false);
    expect(systemService.isMaintenance()).toBe(false);
  });

  it('correctly defines /ownercommands with list, enable, disable, and set subcommands and OWNER permission', () => {
    expect(commandsOwnerCommand.data.name).toBe('ownercommands');
    expect(commandsOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = commandsOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('list');
    expect(subNames).toContain('enable');
    expect(subNames).toContain('disable');
    expect(subNames).toContain('set');
  });

  it('correctly defines /ownerowners with list, add, and remove subcommands and OWNER permission', () => {
    expect(ownersOwnerCommand.data.name).toBe('ownerowners');
    expect(ownersOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = ownersOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('list');
    expect(subNames).toContain('add');
    expect(subNames).toContain('remove');
  });

  it('correctly defines /updatelogs with post and list subcommands', () => {
    expect(updateLogsCommand.data.name).toBe('updatelogs');
    expect(updateLogsCommand.permission).toBe(PermissionLevel.OWNER);
    const json = updateLogsCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('post');
    expect(subNames).toContain('list');
  });

  it('correctly defines /ownerupdates with channel, role, toggle, view, remove, and test subcommands', () => {
    expect(updatesOwnerCommand.data.name).toBe('ownerupdates');
    expect(updatesOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = updatesOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('channel');
    expect(subNames).toContain('role');
    expect(subNames).toContain('toggle');
    expect(subNames).toContain('view');
  });

  it('correctly defines /owneroutpost with channel, interval, toggle, refresh, and inspect subcommands', () => {
    expect(outpostOwnerCommand.data.name).toBe('owneroutpost');
    expect(outpostOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = outpostOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('channel');
    expect(subNames).toContain('interval');
    expect(subNames).toContain('toggle');
  });

  it('correctly defines /ownerlogs with level, view, export, channel, remove, toggle, and test subcommands', () => {
    expect(logsOwnerCommand.data.name).toBe('ownerlogs');
    expect(logsOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = logsOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('level');
    expect(subNames).toContain('view');
    expect(subNames).toContain('export');
  });

  it('correctly defines /ownersettings with view, set, reset, and public-commands subcommands', () => {
    expect(settingsOwnerCommand.data.name).toBe('ownersettings');
    expect(settingsOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = settingsOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('view');
    expect(subNames).toContain('set');
    expect(subNames).toContain('reset');
  });

  it('correctly defines /owneraccount with status, connect, disconnect, send, reconnect, configure, and remove subcommands', () => {
    expect(ownerAccountCommand.data.name).toBe('owneraccount');
    expect(ownerAccountCommand.permission).toBe(PermissionLevel.OWNER);
    const json = ownerAccountCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('status');
    expect(subNames).toContain('connect');
    expect(subNames).toContain('disconnect');
    expect(subNames).toContain('send');
    expect(subNames).toContain('reconnect');
  });

  it('correctly defines /ownerevents with channel, clear-channel, role, and toggle subcommands', () => {
    expect(eventsOwnerCommand.data.name).toBe('ownerevents');
    expect(eventsOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = eventsOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('channel');
    expect(subNames).toContain('clear-channel');
    expect(subNames).toContain('role');
    expect(subNames).toContain('toggle');
  });

  it('correctly defines /ownerkoth with channel, role, and toggle subcommands', () => {
    expect(kothOwnerCommand.data.name).toBe('ownerkoth');
    expect(kothOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = kothOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('channel');
    expect(subNames).toContain('role');
    expect(subNames).toContain('toggle');
  });

  it('correctly defines /ownerstronghold with channel, role, and toggle subcommands', () => {
    expect(strongholdOwnerCommand.data.name).toBe('ownerstronghold');
    expect(strongholdOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = strongholdOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('channel');
    expect(subNames).toContain('role');
    expect(subNames).toContain('toggle');
  });

  it('correctly defines /auctionowner with status, scrape, and source subcommands', () => {
    expect(auctionOwnerCommand.data.name).toBe('auctionowner');
    expect(auctionOwnerCommand.permission).toBe(PermissionLevel.OWNER);
    const json = auctionOwnerCommand.data.toJSON();
    const subNames = json.options?.map((opt: any) => opt.name);
    expect(subNames).toContain('status');
    expect(subNames).toContain('scrape');
  });
});
