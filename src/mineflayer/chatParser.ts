/**
 * SkyPvP Utils — PikaNetwork Chat Parser & Discord ANSI Formatter
 * 
 * Handles structured parsing of PikaNetwork SkyPvP chat identity components:
 * "[TEAM TAG] <PLAYER RANK> PLAYER_USERNAME [ADDITIONAL PLAYER TAG / DECORATIONS] › MESSAGE"
 * 
 * Accurately maps Minecraft color & formatting codes to Discord-supported ANSI escape sequences.
 */

import { stripColorCodes } from '../utils/minecraft.js';
export { stripColorCodes };

export interface ParsedPlayerMessage {
  isPlayer: true;
  teamTag: string | null;         // e.g. "[Purge]"
  rank: string | null;            // e.g. "<Arcane>"
  username: string;               // e.g. "Tobirama"
  additionalTag: string | null;   // e.g. "❰; GOURDED ;❱"
  separator: string;              // "›" or ">"
  message: string;                // "oh wow"
  rawText: string;
  formattedText?: string;
}

export type SystemAnnouncementType =
  | 'VOTE'
  | 'LEVEL_UP'
  | 'COINFLIP'
  | 'KILL'
  | 'EVENT'
  | 'TEAM'
  | 'ANNOUNCEMENT'
  | 'GENERAL';

export interface ParsedSystemMessage {
  isPlayer: false;
  type: SystemAnnouncementType;
  rawText: string;
  formattedText?: string;
}

export type ParsedMinecraftMessage = ParsedPlayerMessage | ParsedSystemMessage;

/**
 * Maps Minecraft color code character (0-f) to Discord-compatible ANSI color sequence.
 * In Discord ANSI:
 *  0: Reset / Normal
 *  1: Bold
 *  4: Underline
 *  30: Dark Gray / Black
 *  31: Red
 *  32: Green
 *  33: Yellow / Gold
 *  34: Blue
 *  35: Magenta / Pink
 *  36: Cyan / Aqua
 *  37: White / Light Gray
 */
export const MINECRAFT_TO_ANSI_COLOR: Record<string, string> = {
  '0': '\u001b[0;30m', // Black -> Dark Gray
  '1': '\u001b[0;34m', // Dark Blue
  '2': '\u001b[0;32m', // Dark Green
  '3': '\u001b[0;36m', // Dark Aqua
  '4': '\u001b[0;31m', // Dark Red
  '5': '\u001b[0;35m', // Dark Purple
  '6': '\u001b[0;33m', // Gold -> Yellow/Gold
  '7': '\u001b[0;37m', // Gray
  '8': '\u001b[0;30m', // Dark Gray
  '9': '\u001b[1;34m', // Blue (Bold/Bright Blue)
  'a': '\u001b[1;32m', // Bright Green
  'b': '\u001b[1;36m', // Aqua / Cyan
  'c': '\u001b[1;31m', // Light Red / Pinkish Red
  'd': '\u001b[1;35m', // Light Purple / Pink
  'e': '\u001b[1;33m', // Yellow
  'f': '\u001b[1;37m', // White
  'r': '\u001b[0m',    // Reset
};

/**
 * Converts a 6-character hex color string (RRGGBB) to the closest Discord ANSI color
 * using Euclidean distance in RGB color space.
 */
export function hexToDiscordAnsi(hex: string): string {
  if (hex.length < 6) return '\u001b[0;37m';
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;

  const ansiColors = [
    { code: '\u001b[0;30m', rgb: [78, 80, 88] },    // Dark Gray / Black
    { code: '\u001b[0;31m', rgb: [237, 66, 69] },   // Red
    { code: '\u001b[0;32m', rgb: [87, 242, 135] },  // Green
    { code: '\u001b[0;33m', rgb: [254, 231, 92] },  // Yellow / Gold
    { code: '\u001b[0;34m', rgb: [88, 101, 242] },  // Blue
    { code: '\u001b[0;35m', rgb: [235, 69, 158] },  // Magenta / Pink
    { code: '\u001b[0;36m', rgb: [0, 180, 200] },   // Cyan / Aqua
    { code: '\u001b[0;37m', rgb: [255, 255, 255] }, // White
  ];

  let closest = ansiColors[7].code;
  let minDist = Infinity;
  for (const c of ansiColors) {
    const dist = (r - c.rgb[0]) ** 2 + (g - c.rgb[1]) ** 2 + (b - c.rgb[2]) ** 2;
    if (dist < minDist) {
      minDist = dist;
      closest = c.code;
    }
  }
  return closest;
}

/**
 * Converts text with Minecraft formatting codes (§) to Discord ANSI escape sequences.
 * Uses a single-pass state machine to prevent stacked/adjacent escape sequences,
 * ensuring 100% compatibility with Discord's highlight.js ANSI parser.
 */
export function minecraftToDiscordAnsi(text: string): string {
  if (!text) return '';

  const mcColorMap: Record<string, number> = {
    '0': 30, // Black -> Dark Gray
    '1': 34, // Dark Blue
    '2': 32, // Dark Green
    '3': 36, // Dark Aqua / Cyan
    '4': 31, // Dark Red
    '5': 35, // Dark Purple
    '6': 33, // Gold -> Yellow/Gold
    '7': 37, // Gray -> White/Light Gray
    '8': 30, // Dark Gray
    '9': 34, // Blue
    'a': 32, // Green
    'b': 36, // Aqua
    'c': 31, // Red
    'd': 35, // Light Purple / Pink
    'e': 33, // Yellow
    'f': 37, // White
  };

  let bold = false;
  let underline = false;
  let color = 37; // Default White

  let lastEmittedState = '';
  let result = '';

  let i = 0;
  while (i < text.length) {
    // Check for 14-char hex format: §x§r§r§g§g§b§b
    if (text.startsWith('§x', i) && i + 13 < text.length) {
      const hex =
        text[i + 3] +
        text[i + 5] +
        text[i + 7] +
        text[i + 9] +
        text[i + 11] +
        text[i + 13];
      // Convert hex to ANSI color number
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;

      const ansiPalette = [
        { code: 30, rgb: [78, 80, 88] },    // Gray
        { code: 31, rgb: [237, 66, 69] },   // Red
        { code: 32, rgb: [87, 242, 135] },  // Green
        { code: 33, rgb: [254, 231, 92] },  // Gold
        { code: 34, rgb: [88, 101, 242] },  // Blue
        { code: 35, rgb: [235, 69, 158] },  // Pink
        { code: 36, rgb: [0, 180, 200] },   // Aqua
        { code: 37, rgb: [255, 255, 255] }, // White
      ];

      let closestCode = 37;
      let minDist = Infinity;
      for (const entry of ansiPalette) {
        const dist = (r - entry.rgb[0]) ** 2 + (g - entry.rgb[1]) ** 2 + (b - entry.rgb[2]) ** 2;
        if (dist < minDist) {
          minDist = dist;
          closestCode = entry.code;
        }
      }

      color = closestCode;
      bold = false;
      underline = false;
      i += 14;
      continue;
    }

    // Standard Minecraft § formatting code
    if (text[i] === '§' && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase();
      if (mcColorMap[code] !== undefined) {
        color = mcColorMap[code];
        bold = false;
        underline = false;
        // Make bright colors bold by default for vibrant Discord rendering
        if (['6', '9', 'a', 'b', 'c', 'd', 'e'].includes(code)) {
          bold = true;
        }
      } else if (code === 'l') {
        bold = true;
      } else if (code === 'n') {
        underline = true;
      } else if (code === 'r') {
        bold = false;
        underline = false;
        color = 37;
      }
      i += 2;
      continue;
    }

    // Normal text character
    const style = bold ? '1' : underline ? '4' : '0';
    const currentState = `${style};${color}`;
    if (currentState !== lastEmittedState) {
      result += `\u001b[${currentState}m`;
      lastEmittedState = currentState;
    }
    result += text[i];
    i++;
  }

  result += '\u001b[0m';
  return result;
}

/**
 * Classifies non-player Minecraft messages into specific system announcement categories.
 */
export function classifySystemMessage(text: string): SystemAnnouncementType {
  const lower = text.toLowerCase();
  if (lower.includes('/level') || lower.includes('has reached level')) return 'LEVEL_UP';
  if (text.startsWith('⛃') || lower.includes('coin flip') || lower.includes('/cf')) return 'COINFLIP';
  if (lower.includes('voted for') || lower.includes('[vote]') || lower.includes('/vote')) return 'VOTE';
  if (
    lower.includes('was slain') ||
    lower.includes('shot by') ||
    lower.includes('burned away') ||
    lower.includes('favored') ||
    lower.includes('took full advantage') ||
    lower.includes('eliminated') ||
    lower.includes('fell from a high place')
  ) {
    return 'KILL';
  }
  if (
    lower.includes('starts in') ||
    lower.includes('event has begun') ||
    lower.includes('now active') ||
    lower.includes('kotl') ||
    lower.includes('envoy drops') ||
    lower.includes('floral fortune') ||
    lower.includes('blood lust') ||
    lower.includes('gold rush') ||
    lower.includes('hard point')
  ) {
    return 'EVENT';
  }
  if (lower.includes('the teams top') || lower.includes('/team top') || lower.includes('created a new team')) {
    return 'TEAM';
  }
  if (lower.includes('welcome to') || lower.includes('special offer')) {
    return 'ANNOUNCEMENT';
  }
  return 'GENERAL';
}

/**
 * Robust parser for PikaNetwork chat messages.
 * 
 * Distinguishes the 4 identity components:
 * 1. Team Tag: e.g. [Purge]
 * 2. Player Rank: e.g. <Arcane>
 * 3. Username: Minecraft username [a-zA-Z0-9_]{3,16}
 * 4. Additional Player Tag / Decorations: e.g. ❰; GOURDED ;❱ or 「:Reaper:」
 * Separator: › (\u203A) or >
 * Message: the actual player message
 */
export function parsePikaChatMessage(raw: string, formatted?: string): ParsedMinecraftMessage {
  const plain = stripColorCodes(raw).trim();

  // Find separator: '›' (\u203A) or '>'
  let sepIdx = plain.indexOf('›');
  let sepChar = '›';
  if (sepIdx === -1) {
    sepIdx = plain.indexOf('>');
    sepChar = '>';
  }

  // If no separator is present, this cannot be a player chat message
  if (sepIdx === -1) {
    return {
      isPlayer: false,
      type: classifySystemMessage(plain),
      rawText: plain,
      formattedText: formatted || raw,
    };
  }

  const identityPart = plain.substring(0, sepIdx).trim();
  const messagePart = plain.substring(sepIdx + 1).trim();

  // Validate identity & message parts exist
  if (!identityPart || !messagePart) {
    return {
      isPlayer: false,
      type: classifySystemMessage(plain),
      rawText: plain,
      formattedText: formatted || raw,
    };
  }

  let remaining = identityPart;
  let teamTag: string | null = null;
  let rank: string | null = null;
  let username = '';
  let additionalTag: string | null = null;

  // 1. Team tag: must start with '[' and have closing ']'
  if (remaining.startsWith('[')) {
    const endBracket = remaining.indexOf(']');
    if (endBracket !== -1) {
      teamTag = remaining.substring(0, endBracket + 1);
      remaining = remaining.substring(endBracket + 1).trim();
    }
  }

  // 2. Rank: must start with '<' and have closing '>'
  if (remaining.startsWith('<')) {
    const endAngle = remaining.indexOf('>');
    if (endAngle !== -1) {
      rank = remaining.substring(0, endAngle + 1);
      remaining = remaining.substring(endAngle + 1).trim();
    }
  }

  // 3. Username and 4. Additional player tag / decorations:
  const spaceIdx = remaining.indexOf(' ');
  if (spaceIdx === -1) {
    username = remaining;
    additionalTag = null;
  } else {
    username = remaining.substring(0, spaceIdx).trim();
    const tag = remaining.substring(spaceIdx + 1).trim();
    additionalTag = tag.length > 0 ? tag : null;
  }

  // Validate extracted username is non-empty and does not look like system text
  if (!username || username.includes('http') || username.length > 24) {
    return {
      isPlayer: false,
      type: classifySystemMessage(plain),
      rawText: plain,
      formattedText: formatted || raw,
    };
  }

  return {
    isPlayer: true,
    teamTag,
    rank,
    username,
    additionalTag,
    separator: sepChar,
    message: messagePart,
    rawText: plain,
    formattedText: formatted || raw,
  };
}

/**
 * Formats a Minecraft chat message into Discord ANSI code block format,
 * preserving individual component colors and isolating formatting between components.
 */
export function formatChatForDiscord(raw: string, jsonMsg?: any): string {
  const formatted = jsonMsg && typeof jsonMsg.toMotd === 'function' ? jsonMsg.toMotd() : raw;
  const parsed = parsePikaChatMessage(raw, formatted);

  let ansiContent = '';

  if (parsed.isPlayer) {
    // Check if we have source Minecraft formatting codes
    if (formatted && formatted.includes('§')) {
      // Use original Minecraft formatting directly
      ansiContent = minecraftToDiscordAnsi(formatted);
    } else {
      // Apply clean, distinct component colors when source codes are plain
      const parts: string[] = [];

      // 1. Team tag: Gray
      if (parsed.teamTag) {
        parts.push(`\u001b[0;37m${parsed.teamTag}\u001b[0m`);
      }

      // 2. Rank: Bold Magenta / Pink
      if (parsed.rank) {
        parts.push(`\u001b[1;35m${parsed.rank}\u001b[0m`);
      }

      // 3. Username: Bold White
      parts.push(`\u001b[1;37m${parsed.username}\u001b[0m`);

      // 4. Additional player tag / decorations: Yellow / Gold
      if (parsed.additionalTag) {
        parts.push(`\u001b[0;33m${parsed.additionalTag}\u001b[0m`);
      }

      // 5. Separator: Dark Gray
      parts.push(`\u001b[0;30m${parsed.separator}\u001b[0m`);

      // 6. Message: White
      parts.push(`\u001b[0;37m${parsed.message}\u001b[0m`);

      ansiContent = parts.join(' ');
    }
  } else {
    // System message
    if (formatted && formatted.includes('§')) {
      ansiContent = minecraftToDiscordAnsi(formatted);
    } else {
      switch (parsed.type) {
        case 'LEVEL_UP':
          ansiContent = `\u001b[1;32m${parsed.rawText}\u001b[0m`; // Green
          break;
        case 'COINFLIP':
        case 'EVENT':
          ansiContent = `\u001b[1;33m${parsed.rawText}\u001b[0m`; // Gold / Yellow
          break;
        case 'KILL':
          ansiContent = `\u001b[0;31m${parsed.rawText}\u001b[0m`; // Red
          break;
        case 'VOTE':
          ansiContent = `\u001b[1;36m${parsed.rawText}\u001b[0m`; // Cyan
          break;
        default:
          ansiContent = `\u001b[0;37m${parsed.rawText}\u001b[0m`; // White
          break;
      }
    }
  }

  // Ensure content stays within Discord's 2000 character limit
  if (ansiContent.length > 1950) {
    ansiContent = ansiContent.substring(0, 1940) + '...\u001b[0m';
  }

  return `\`\`\`ansi\n${ansiContent}\n\`\`\``;
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: any[];
}

export function getRankHexColor(rank: string | null, type?: string): number {
  if (!rank) {
    if (type === 'LEVEL_UP') return 0x55ff55; // Green
    if (type === 'COINFLIP') return 0xffaa00; // Gold
    if (type === 'KILL') return 0xff5555;     // Red
    if (type === 'EVENT') return 0xffaa00;    // Gold
    return 0x5865f2;                         // Discord Blurple
  }
  const lower = rank.toLowerCase();
  if (lower.includes('arcane')) return 0xff55ff; // Magenta / Pink
  if (lower.includes('divine')) return 0xffaa00; // Gold
  if (lower.includes('sigma')) return 0x55ffff;  // Aqua / Cyan
  if (lower.includes('gladiator') || lower.includes('purge')) return 0xff5555; // Red
  if (lower.includes('champion')) return 0xffff55; // Yellow
  if (lower.includes('elite') || lower.includes('vip')) return 0x55ff55; // Green
  return 0x5865f2;
}

export function formatChatPayload(raw: string, jsonMsg?: any, style = 'ANSI'): DiscordMessagePayload {
  const formatted = jsonMsg && typeof jsonMsg.toMotd === 'function' ? jsonMsg.toMotd() : raw;
  const parsed = parsePikaChatMessage(raw, formatted);

  if (style === 'EMBED') {
    const embedColor = parsed.isPlayer
      ? getRankHexColor(parsed.rank)
      : getRankHexColor(null, parsed.type);

    let desc = '';
    if (parsed.isPlayer) {
      const teamPart = parsed.teamTag ? `**${parsed.teamTag}** ` : '';
      const rankPart = parsed.rank ? `**${parsed.rank}** ` : '';
      const tagPart = parsed.additionalTag ? `${parsed.additionalTag} ` : '';
      desc = `${teamPart}${rankPart}**${parsed.username}** ${tagPart}› ${parsed.message}`;
    } else {
      desc = `**${parsed.rawText}**`;
    }

    return {
      embeds: [
        {
          description: desc,
          color: embedColor,
        },
      ],
    };
  }

  if (style === 'MARKDOWN') {
    if (parsed.isPlayer) {
      const teamPart = parsed.teamTag ? `**${parsed.teamTag}** ` : '';
      const rankPart = parsed.rank ? `**${parsed.rank}** ` : '';
      const tagPart = parsed.additionalTag ? `${parsed.additionalTag} ` : '';
      return {
        content: `${teamPart}${rankPart}**${parsed.username}** ${tagPart}› ${parsed.message}`,
      };
    } else {
      return {
        content: `**${parsed.rawText}**`,
      };
    }
  }

  // Default ANSI style
  return {
    content: formatChatForDiscord(raw, jsonMsg),
  };
}

/**
 * Filter non-public conversations (Private messages, Party, Guild, Staff)
 */
export function isPrivateOrRestrictedMessage(text: string): boolean {
  const clean = stripColorCodes(text).toLowerCase();
  return (
    clean.startsWith('from ') ||
    clean.startsWith('to ') ||
    clean.includes('[party]') ||
    clean.includes('[guild]') ||
    clean.includes('[staff]') ||
    clean.includes('[msg]') ||
    clean.includes('whispers:')
  );
}

/**
 * Filter internal bot connection prompts, login notices, and HUD progression spam
 */
export function isIgnoredOrSpamMessage(text: string): boolean {
  const clean = stripColorCodes(text);
  if (!clean) return true;

  // Filter HUD level progress bar spam (e.g. Iron I ➟ Iron II [1,000/1,025])
  if (clean.includes('➟') || /\[\d+[\d,]*\/\d+[\d,]*\]/.test(clean)) {
    return true;
  }

  const lower = clean.toLowerCase();

  // Filter internal login/connection notices
  if (
    lower.includes('please register') ||
    lower.includes('successfully registered') ||
    lower.includes('successful login') ||
    lower.includes('welcome to pikanetwork') ||
    lower.includes('right click the server selector') ||
    lower.includes('trying to send you to') ||
    lower.includes('server queue') ||
    lower.includes('you are in position') ||
    lower.includes('cannot direct connect you to') ||
    lower.startsWith('(!) fly mode enabled')
  ) {
    return true;
  }

  return false;
}
