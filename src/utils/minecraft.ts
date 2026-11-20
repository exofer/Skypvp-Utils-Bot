/**
 * Extract plain text from any Minecraft text component, NBT object, or string
 */
export function extractPlainText(input: any): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') {
    if ((input.startsWith('{') && input.endsWith('}')) || (input.startsWith('[') && input.endsWith(']'))) {
      try {
        const parsed = JSON.parse(input);
        return extractPlainText(parsed);
      } catch {
        // Not valid JSON, keep as is
      }
    }
    return input;
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input);
  }
  if (typeof input === 'object') {
    // If it's NBT object with type/value, e.g. { type: 'string', value: 'Auction (1/7)' }
    if (input.value !== undefined && typeof input.type === 'string') {
      return extractPlainText(input.value);
    }
    let res = '';
    if (typeof input.text === 'string') {
      res += input.text;
    }
    if (Array.isArray(input.extra)) {
      for (const ex of input.extra) {
        res += extractPlainText(ex);
      }
    }
    if (Array.isArray(input)) {
      for (const item of input) {
        res += extractPlainText(item);
      }
    }
    if (!res && input.value !== undefined) {
      return extractPlainText(input.value);
    }
    return res;
  }
  return String(input);
}

/**
 * Strip Minecraft color and formatting codes (§a, §l, etc.)
 */
export function stripColorCodes(input: any): string {
  const plain = extractPlainText(input);
  if (!plain) return '';
  return plain.replace(/§[0-9a-fk-orx]/gi, '').trim();
}

/**
 * Format numbers with comma grouping (e.g. 12,345)
 */
export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '0';
  const val = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(val)) return '0';
  return val.toLocaleString('en-US');
}

/**
 * Clean and truncate message to avoid Discord message length limits
 */
export function sanitizeChat(text: string, maxLength = 2000): string {
  const stripped = stripColorCodes(text);
  if (stripped.length <= maxLength) return stripped;
  return stripped.substring(0, maxLength - 3) + '...';
}

/**
 * Format Minecraft / SkyPvP weapon name for readable display
 */
export function formatWeaponName(weapon: any, fallback?: any): string {
  let raw: any = weapon;
  if (!raw && fallback) {
    raw = fallback;
  }
  if (!raw) return '';

  let name = '';
  if (typeof raw === 'string') {
    name = raw;
  } else if (typeof raw === 'object') {
    if (raw.item) {
      name = String(raw.item);
    } else if (raw.name) {
      name = String(raw.name);
    } else if (raw.id) {
      name = String(raw.id);
    }
  }

  if (!name) return '';

  // Strip color codes if any
  name = stripColorCodes(name);

  // If prefixed with kit (e.g. kit:Starter:DIAMOND_SWORD)
  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[parts.length - 1] || name;
  }

  // Handle common Minecraft enum constants
  const knownItems: Record<string, string> = {
    DIAMOND_SWORD: 'Diamond Sword',
    NETHERITE_SWORD: 'Netherite Sword',
    IRON_SWORD: 'Iron Sword',
    GOLDEN_SWORD: 'Golden Sword',
    GOLD_SWORD: 'Golden Sword',
    STONE_SWORD: 'Stone Sword',
    WOODEN_SWORD: 'Wooden Sword',
    WOOD_SWORD: 'Wooden Sword',
    DIAMOND_AXE: 'Diamond Axe',
    NETHERITE_AXE: 'Netherite Axe',
    IRON_AXE: 'Iron Axe',
    BOW: 'Bow',
    CROSSBOW: 'Crossbow',
    TRIDENT: 'Trident',
    SKULL_ITEM: 'Player Skull',
    FISHING_ROD: 'Fishing Rod',
    COOKED_BEEF: 'Steak',
    GOLDEN_APPLE: 'Golden Apple',
    ENCHANTED_GOLDEN_APPLE: 'Enchanted Golden Apple',
  };

  const upper = name.toUpperCase();
  if (knownItems[upper]) {
    return knownItems[upper];
  }

  // Replace underscores and capitalize words
  if (name.includes('_')) {
    return name
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // Insert space before capital letters in camel/PascalCase if appropriate
  // e.g. OblivionBlade -> Oblivion Blade
  if (/^[A-Z][a-z]+[A-Z]/.test(name)) {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}
