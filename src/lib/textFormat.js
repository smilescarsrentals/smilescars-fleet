// Converts text to Title Case regardless of how it was typed (lowercase,
// ALL CAPS, mixed) — lowercases everything first, then capitalizes the
// first letter of each word. Word boundaries include spaces and hyphens,
// so "jean-pierre" becomes "Jean-Pierre", not "Jean-pierre".
export function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/(^|[\s-])\w/g, c => c.toUpperCase());
}
