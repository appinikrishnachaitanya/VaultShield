import {
  detectIdentifiers,
  normalizePrivateText,
  type IdentifierCategory,
} from "./privacy";
import type { TokenVaultSession } from "./tokenVault";
export type LeakFinding = {
  category: IdentifierCategory | "Digit run" | "High-entropy string";
  start: number;
  end: number;
  hard: boolean;
};
export type LeakResult = {
  status: "PASS" | "WARN";
  blocked: boolean;
  findings: LeakFinding[];
};
const canonical = (s: string) =>
  normalizePrivateText(s).toLowerCase().replace(/\s/g, "");
export function runLeakTest(
  text: string,
  session?: TokenVaultSession,
): LeakResult {
  const findings: LeakFinding[] = detectIdentifiers(text).matches.map((m) => ({
    category: m.category,
    start: m.start,
    end: m.end,
    hard: false,
  }));
  // Blank tokens without shifting offsets: attributes and token numbers are deliberate disclosures.
  const stripped = text.replace(/\[[A-Z_]+_\d+(?::[^\]]+)?\]/gi, (m) =>
    " ".repeat(m.length),
  );
  for (const m of stripped.matchAll(/\d(?:[\s-]*\d){5,}/g))
    findings.push({
      category: "Digit run",
      start: m.index!,
      end: m.index! + m[0].length,
      hard: false,
    });
  for (const m of stripped.matchAll(
    /\b(?=[A-Za-z0-9_+/=-]{24,}\b)(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{24,}\b/g,
  ))
    findings.push({
      category: "High-entropy string",
      start: m.index!,
      end: m.index! + m[0].length,
      hard: false,
    });
  const normalized = normalizePrivateText(text);
  let compact = "";
  const positions: number[] = [];
  for (let i = 0; i < normalized.length; i++)
    if (!/\s/.test(normalized[i])) {
      compact += normalized[i].toLowerCase();
      positions.push(i);
    }
  for (const entry of session?.entries() ?? []) {
    const value =
      entry.category === "PERSON" || entry.category === "ORG"
        ? entry.original.replace(/^[^:]+:\s*/, "")
        : entry.original;
    const needle = canonical(value);
    if (!needle) continue;
    let cursor = 0;
    while (cursor < compact.length) {
      const index = compact.indexOf(needle, cursor);
      if (index < 0) break;
      findings.push({
        category: entry.category,
        start: positions[index],
        end: positions[index + needle.length - 1] + 1,
        hard: true,
      });
      cursor = index + needle.length;
    }
  }
  return {
    status: findings.length ? "WARN" : "PASS",
    blocked: findings.some((f) => f.hard),
    findings,
  };
}
export function assertNoKnownLeak(text: string, session?: TokenVaultSession) {
  if (runLeakTest(text, session).blocked)
    throw new Error(
      "A private value remains in the reviewed text. Remove it before approving.",
    );
}
