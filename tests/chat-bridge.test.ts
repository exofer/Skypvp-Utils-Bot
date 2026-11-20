import { describe, it, expect } from 'vitest';
import { stripColorCodes, sanitizeChat } from '../src/utils/minecraft.js';
import {
  parsePikaChatMessage,
  formatChatForDiscord,
  formatChatPayload,
  minecraftToDiscordAnsi,
  hexToDiscordAnsi,
  isPrivateOrRestrictedMessage,
  isIgnoredOrSpamMessage,
  type ParsedPlayerMessage,
  type ParsedSystemMessage,
} from '../src/mineflayer/chatParser.js';

describe('Minecraft Chat Bridge Filtering & Sanitization', () => {
  it('strips Minecraft color and formatting codes (§)', () => {
    const raw = '§6[SkyPvP] §ePlayer123§7: §aSelling Dragon Sword for §6$50,000!';
    const cleaned = stripColorCodes(raw);

    expect(cleaned).toBe('[SkyPvP] Player123: Selling Dragon Sword for $50,000!');
    expect(cleaned.includes('§')).toBe(false);
  });

  it('safely handles empty or null strings', () => {
    expect(stripColorCodes(null)).toBe('');
    expect(stripColorCodes(undefined)).toBe('');
    expect(stripColorCodes('')).toBe('');
  });

  it('truncates messages exceeding Discord 2000 character limits', () => {
    const hugeMessage = 'A'.repeat(2500);
    const sanitized = sanitizeChat(hugeMessage, 2000);

    expect(sanitized.length).toBeLessThanOrEqual(2000);
    expect(sanitized.endsWith('...')).toBe(true);
  });

  it('identifies and filters private message patterns', () => {
    expect(isPrivateOrRestrictedMessage('From StaffMember: Please respond')).toBe(true);
    expect(isPrivateOrRestrictedMessage('To SomePlayer: Hello there')).toBe(true);
    expect(isPrivateOrRestrictedMessage('[Party] Leader: Warp out now')).toBe(true);
    expect(isPrivateOrRestrictedMessage('[Guild] Member: GG on the fight')).toBe(true);
    expect(isPrivateOrRestrictedMessage('[Staff] Mod: checking report')).toBe(true);
    expect(isPrivateOrRestrictedMessage('whispers: hello')).toBe(true);
    expect(isPrivateOrRestrictedMessage('[Purge] <Arcane> Tobirama › hello in public')).toBe(false);
  });

  it('identifies and filters internal hub prompts and HUD level spam', () => {
    expect(isIgnoredOrSpamMessage('Iron I ➟ Iron II [1,000/1,025]')).toBe(true);
    expect(isIgnoredOrSpamMessage('PikaNetwork » Please register with /register <password> <password>')).toBe(true);
    expect(isIgnoredOrSpamMessage('PikaNetwork » Successful login!')).toBe(true);
    expect(isIgnoredOrSpamMessage('(!) Fly mode enabled.')).toBe(true);
    expect(isIgnoredOrSpamMessage('Server Queue ▏ You are queued to join SkyPvP')).toBe(true);
    expect(isIgnoredOrSpamMessage('[Purge] <Arcane> Tobirama › regular chat')).toBe(false);
  });
});

describe('PikaNetwork Chat Structure Parsing (chatprompt.txt Acceptance Criteria)', () => {
  it('correctly identifies all 4 identity components: [Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow';
    const formatted = '§7[Purge] §d§l<Arcane> §fTobirama §6❰; GOURDED ;❱ §8› §foh wow';
    const parsed = parsePikaChatMessage(raw, formatted) as ParsedPlayerMessage;

    expect(parsed.isPlayer).toBe(true);
    expect(parsed.teamTag).toBe('[Purge]');
    expect(parsed.rank).toBe('<Arcane>');
    expect(parsed.username).toBe('Tobirama');
    expect(parsed.additionalTag).toBe('❰; GOURDED ;❱');
    expect(parsed.separator).toBe('›');
    expect(parsed.message).toBe('oh wow');
  });

  it('correctly parses [BwOg] <Sigma> SuperPhysics 「:Reaper:」 › but he made rosalia leader', () => {
    const raw = '[BwOg] <Sigma> SuperPhysics 「:Reaper:」 › but he made rosalia leader';
    const parsed = parsePikaChatMessage(raw) as ParsedPlayerMessage;

    expect(parsed.isPlayer).toBe(true);
    expect(parsed.teamTag).toBe('[BwOg]');
    expect(parsed.rank).toBe('<Sigma>');
    expect(parsed.username).toBe('SuperPhysics');
    expect(parsed.additionalTag).toBe('「:Reaper:」');
    expect(parsed.message).toBe('but he made rosalia leader');
  });

  it('correctly parses [RzmpxgeStxr] <Divine> MrrKurdo ⚡ SERAPH ⚡ › gg', () => {
    const raw = '[RzmpxgeStxr] <Divine> MrrKurdo ⚡ SERAPH ⚡ › gg';
    const parsed = parsePikaChatMessage(raw) as ParsedPlayerMessage;

    expect(parsed.isPlayer).toBe(true);
    expect(parsed.teamTag).toBe('[RzmpxgeStxr]');
    expect(parsed.rank).toBe('<Divine>');
    expect(parsed.username).toBe('MrrKurdo');
    expect(parsed.additionalTag).toBe('⚡ SERAPH ⚡');
    expect(parsed.message).toBe('gg');
  });

  it('correctly parses players without additional tags: [Snowball] <Divine> IAmGettingBanned › u said u had access', () => {
    const raw = '[Snowball] <Divine> IAmGettingBanned › u said u had access';
    const parsed = parsePikaChatMessage(raw) as ParsedPlayerMessage;

    expect(parsed.isPlayer).toBe(true);
    expect(parsed.teamTag).toBe('[Snowball]');
    expect(parsed.rank).toBe('<Divine>');
    expect(parsed.username).toBe('IAmGettingBanned');
    expect(parsed.additionalTag).toBeNull();
    expect(parsed.message).toBe('u said u had access');
  });

  it('correctly parses players without team tags: <Divine> qAstella ❈ !DEMURE! ❈ › like 96', () => {
    const raw = '<Divine> qAstella ❈ !DEMURE! ❈ › like 96';
    const parsed = parsePikaChatMessage(raw) as ParsedPlayerMessage;

    expect(parsed.isPlayer).toBe(true);
    expect(parsed.teamTag).toBeNull();
    expect(parsed.rank).toBe('<Divine>');
    expect(parsed.username).toBe('qAstella');
    expect(parsed.additionalTag).toBe('❈ !DEMURE! ❈');
    expect(parsed.message).toBe('like 96');
  });

  it('preserves Unicode symbols in message content and player decorations', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › Special: ⚔️ 🛡️ ✦ ➜ ⛃';
    const parsed = parsePikaChatMessage(raw) as ParsedPlayerMessage;

    expect(parsed.additionalTag).toBe('❰; GOURDED ;❱');
    expect(parsed.message).toBe('Special: ⚔️ 🛡️ ✦ ➜ ⛃');
  });

  it('handles public system announcements separately from player messages', () => {
    const levelUp = parsePikaChatMessage('➜ HaHaBongXi has reached Level 3! /level') as ParsedSystemMessage;
    expect(levelUp.isPlayer).toBe(false);
    expect(levelUp.type).toBe('LEVEL_UP');

    const coinFlip = parsePikaChatMessage('⛃ itsmestevehere created a Coin Flip for $17,000! Play against them using /cf.') as ParsedSystemMessage;
    expect(coinFlip.isPlayer).toBe(false);
    expect(coinFlip.type).toBe('COINFLIP');

    const killFeed = parsePikaChatMessage('The luck of the Irish favored qAstella with IISHARK IS ONII over Lodhi_Bhai') as ParsedSystemMessage;
    expect(killFeed.isPlayer).toBe(false);
    expect(killFeed.type).toBe('KILL');

    const eventMsg = parsePikaChatMessage('KoTL Game starts in 5 minutes! Prepare yourself for the challenge ahead.') as ParsedSystemMessage;
    expect(eventMsg.isPlayer).toBe(false);
    expect(eventMsg.type).toBe('EVENT');
  });

  it('safely preserves messages that cannot be reliably parsed (fallback)', () => {
    const unparseable = 'Random system broadcast without brackets or symbols';
    const parsed = parsePikaChatMessage(unparseable) as ParsedSystemMessage;

    expect(parsed.isPlayer).toBe(false);
    expect(parsed.rawText).toBe(unparseable);
  });
});

describe('Discord ANSI Color Representation & Component Isolation', () => {
  it('accurately translates Minecraft color codes (§) into Discord ANSI codes', () => {
    const formatted = '§7[Purge] §d§l<Arcane> §fTobirama §6❰; GOURDED ;❱ §8› §foh wow';
    const ansi = minecraftToDiscordAnsi(formatted);

    // §7 (gray) -> \u001b[0;37m
    expect(ansi).toContain('\u001b[0;37m[Purge]');
    // §d (pink/purple) + §l (bold) -> single clean sequence \u001b[1;35m<Arcane>
    expect(ansi).toContain('\u001b[1;35m<Arcane>');
    // §f (white) -> \u001b[0;37m
    expect(ansi).toContain('Tobirama');
    // §6 (gold) -> \u001b[1;33m
    expect(ansi).toContain('\u001b[1;33m❰; GOURDED ;❱');
    // §8 (dark gray) -> \u001b[0;30m
    expect(ansi).toContain('\u001b[0;30m›');
    // Ends with reset sequence \u001b[0m
    expect(ansi.endsWith('\u001b[0m')).toBe(true);
  });

  it('maps hex colors accurately to Discord ANSI colors', () => {
    expect(hexToDiscordAnsi('FFAA00')).toBe('\u001b[0;33m'); // Gold/Yellow
    expect(hexToDiscordAnsi('00AAAA')).toBe('\u001b[0;36m'); // Cyan/Aqua
    expect(hexToDiscordAnsi('FF5555')).toBe('\u001b[0;31m'); // Red
    expect(hexToDiscordAnsi('55FF55')).toBe('\u001b[0;32m'); // Green
  });

  it('wraps formatted messages in Discord ANSI code blocks (```ansi)', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow';
    const formatted = '§7[Purge] §d§l<Arcane> §fTobirama §6❰; GOURDED ;❱ §8› §foh wow';
    const discordOutput = formatChatForDiscord(raw, { toMotd: () => formatted });

    expect(discordOutput.startsWith('```ansi\n')).toBe(true);
    expect(discordOutput.endsWith('\n```')).toBe(true);
    expect(discordOutput).toContain('Tobirama');
    expect(discordOutput).toContain('❰; GOURDED ;❱');
    expect(discordOutput).toContain('oh wow');
  });

  it('formats plain messages with distinct ANSI colors for each component when Minecraft codes are missing', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow';
    const discordOutput = formatChatForDiscord(raw);

    expect(discordOutput.startsWith('```ansi\n')).toBe(true);
    // Team tag in gray
    expect(discordOutput).toContain('\u001b[0;37m[Purge]\u001b[0m');
    // Rank in bold purple
    expect(discordOutput).toContain('\u001b[1;35m<Arcane>\u001b[0m');
    // Username in bold white
    expect(discordOutput).toContain('\u001b[1;37mTobirama\u001b[0m');
    // Tag in gold
    expect(discordOutput).toContain('\u001b[0;33m❰; GOURDED ;❱\u001b[0m');
    // Separator in dark gray
    expect(discordOutput).toContain('\u001b[0;30m›\u001b[0m');
    // Message in white
    expect(discordOutput).toContain('\u001b[0;37moh wow\u001b[0m');
  });

  it('supports EMBED style formatting with dynamic rank color borders for mobile/desktop', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow';
    const payload = formatChatPayload(raw, undefined, 'EMBED');

    expect(payload.embeds).toBeDefined();
    expect(payload.embeds?.length).toBe(1);
    expect(payload.embeds?.[0].description).toContain('[Purge]');
    expect(payload.embeds?.[0].description).toContain('<Arcane>');
    expect(payload.embeds?.[0].description).toContain('Tobirama');
    expect(payload.embeds?.[0].description).toContain('oh wow');
    expect(payload.embeds?.[0].color).toBe(0xff55ff); // Arcane purple/magenta
  });

  it('supports MARKDOWN style formatting with clean bold text and no codebox', () => {
    const raw = '[Purge] <Arcane> Tobirama ❰; GOURDED ;❱ › oh wow';
    const payload = formatChatPayload(raw, undefined, 'MARKDOWN');

    expect(payload.content).toBe('**[Purge]** **<Arcane>** **Tobirama** ❰; GOURDED ;❱ › oh wow');
    expect(payload.content?.includes('```')).toBe(false);
  });
});

