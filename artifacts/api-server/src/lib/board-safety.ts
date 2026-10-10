/**
 * Small, editable server-side whole-word filter used to create moderator review
 * reports. It never rejects or rewrites submitted Board content.
 */
export const OBJECTIONABLE_BOARD_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "damn",
] as const;

export function findObjectionableTerms(content: string): string[] {
  const matches = new Set<string>();
  for (const term of OBJECTIONABLE_BOARD_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wholeWord = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu");
    if (wholeWord.test(content)) matches.add(term);
  }
  return [...matches];
}
