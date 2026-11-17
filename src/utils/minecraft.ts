/**
 * Strip Minecraft color and formatting codes (§a, §l, etc.)
 */
export function stripColorCodes(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/§[0-9a-fk-or]/gi, '').trim();
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
