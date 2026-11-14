// Limits on what a seller can type into a listing. Shared by the server checks (lib/repo.ts), the
// AI description writer (lib/ai.ts) and the listing form, so all three agree. The database has the
// same cap on products.description (migration 049).
export const MAX_PRODUCT_DESCRIPTION_LENGTH = 1000;

// Shortens text to fit `max` characters, ending at the last full sentence that fits (or the last
// word, if no sentence ends in the second half). Used for AI-written descriptions, which can run
// over; never used to silently cut what a seller typed.
export function clipToLimit(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf(".\n"));
  if (sentenceEnd >= max / 2) return head.slice(0, sentenceEnd + 1).trim();
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trim();
}
