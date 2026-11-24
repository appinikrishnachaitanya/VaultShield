import type { Stage } from "../types/privacy";

export type EvidencePart = { text: string; stage?: Stage["name"] };

// Match only literal evidence present in the redacted preview. Never inject HTML,
// replace redaction markers, or manufacture a quote from model paraphrasing.
export function pressureEvidenceParts(
  text: string,
  stages: Stage[],
): EvidencePart[] {
  const matches: { start: number; end: number; stage: Stage["name"] }[] = [];
  for (const stage of stages) {
    const evidence = stage.evidence.trim();
    if (!stage.found || !evidence || evidence.includes("[REDACTED]")) continue;
    // Case-folded strings can change length (for example İ -> i + a dot).
    // Match against the original so offsets always refer to the displayed text.
    const literal = evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(literal, "giu"))) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        stage: stage.name,
      });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: EvidencePart[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor)
      parts.push({ text: text.slice(cursor, match.start) });
    parts.push({
      text: text.slice(match.start, match.end),
      stage: match.stage,
    });
    cursor = match.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
