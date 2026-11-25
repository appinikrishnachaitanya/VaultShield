import {
  detectIdentifiers,
  normalizePrivateText,
  type IdentifierCategory,
} from "./privacy";
import type { SanitizedText } from "../types/privacy";
export type TokenEntry = {
  token: string;
  category: IdentifierCategory;
  original: string;
  start: number;
  end: number;
};
export type TokenCounts = Partial<Record<IdentifierCategory, number>>;
export function countTokens(text: string): TokenCounts {
  const counts: TokenCounts = {};
  const categories: IdentifierCategory[] = ['PERSON','PHONE','BANK_ACC','UPI','AADHAAR','PAN','EMAIL','URL','AMOUNT','OTP','ORG','REFERENCE','IFSC','PRIVATE'];
  for (const match of text.matchAll(/\[([A-Z_]+)_\d+(?::[^\]]+)?\]/gi)) {
    const category=categories.find(value=>value===match[1].toUpperCase());
    if(category)counts[category]=(counts[category]??0)+1;
  }
  return counts;
}
export type Tokenized = {
  text: SanitizedText;
  entries: TokenEntry[];
  counts: TokenCounts;
};
// Closed attributes: URL shortener / bank-like / agency-like / other; amount lt1k / 1k-10k / 10k-50k / 50k-plus.
// Attributes disclose only broad classes, never domains, query strings or exact amounts.
export function tokenAttribute(
  category: IdentifierCategory,
  value: string,
): string {
  if (category === "URL") {
    let host = "";
    try {
      host = new URL(
        value.startsWith("www.") ? "https://" + value : value,
      ).hostname.toLowerCase();
    } catch {
      return "other";
    }
    if (/^(?:bit\.ly|t\.co|tinyurl\.com|wa\.me|shorturl\.at)$/.test(host))
      return "shortener";
    if (/sbi|hdfc|icici|axis|bank|kyc/.test(host)) return "bank-like";
    if (/cbi|police|gov|court|aadhaar/.test(host)) return "agency-like";
    return "other";
  }
  if (category === "AMOUNT") {
    const amount = Number(value.replace(/[^\d.]/g, ""));
    return amount < 1000
      ? "lt1k"
      : amount < 10000
        ? "1k-10k"
        : amount <= 50000
          ? "10k-50k"
          : "50k-plus";
  }
  return "";
}
/** This object and its Maps are tab-memory only. Never serialize an instance or its entries. */
export class TokenVaultSession {
  onExpire?: () => void;
  private values = new Map<string, TokenEntry>();
  private tokens = new Map<string, TokenEntry>();
  private serial: TokenCounts = {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  get version() {
    return this.revision;
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.clear();
      this.onExpire?.();
    }, 15 * 60_000);
  }
  clear() {
    this.values.clear();
    this.tokens.clear();
    this.serial = {};
    clearTimeout(this.timer);
    this.revision++;
  }
  entries() {
    return [...this.tokens.values()].map((x) => ({ ...x }));
  }
  tokenize(input: string): Tokenized {
    this.touch();
    const found = detectIdentifiers(input);
    // Map normalized offsets to original Unicode code points for exact local round trips.
    const offsets: { start: number; end: number }[] = [];
    let offset = 0;
    // Grapheme normalization keeps offsets correct for combining accents and Indic clusters.
    const segments =
      typeof Intl.Segmenter === "function"
        ? Array.from(
            new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
              input,
            ),
            (part) => part.segment,
          )
        : Array.from(input);
    for (const segment of segments) {
      const end = offset + segment.length;
      for (let i = 0; i < normalizePrivateText(segment).length; i++)
        offsets.push({ start: offset, end });
      offset = end;
    }
    let text = found.text;
    const entries: TokenEntry[] = [];
    const counts: TokenCounts = {};
    for (const m of found.matches) {
      const original = input.slice(
        offsets[m.start]?.start ?? m.start,
        offsets[m.end - 1]?.end ?? m.end,
      );
      const key = m.category + ":" + original;
      let entry = this.values.get(key);
      if (!entry) {
        const n = (this.serial[m.category] ?? 0) + 1;
        this.serial[m.category] = n;
        const attr = tokenAttribute(m.category, m.value);
        entry = {
          token: `[${m.category}_${n}${attr ? ":" + attr : ""}]`,
          category: m.category,
          original,
          start: offsets[m.start]?.start ?? m.start,
          end: offsets[m.end - 1]?.end ?? m.end,
        };
        this.values.set(key, entry);
        this.tokens.set(entry.token.toUpperCase().replace(/\s/g, ""), entry);
      }
      entries.push({
        ...entry,
        start: offsets[m.start]?.start ?? m.start,
        end: offsets[m.end - 1]?.end ?? m.end,
      });
      counts[m.category] = (counts[m.category] ?? 0) + 1;
    }
    for (let i = found.matches.length - 1; i >= 0; i--) {
      const m = found.matches[i];
      text = text.slice(0, m.start) + entries[i].token + text.slice(m.end);
    }
    text = text.replace(/\[REDACTED\]/gi, () => {
      const n = (this.serial.PRIVATE ?? 0) + 1;
      this.serial.PRIVATE = n;
      counts.PRIVATE = (counts.PRIVATE ?? 0) + 1;
      return `[PRIVATE_${n}]`;
    });
    return { text: text as SanitizedText, entries, counts };
  }
  resolve(token: string) {
    return this.tokens.get(token.toUpperCase().replace(/\s/g, ""))?.original;
  }
}
export function rehydrate(text: string, session: TokenVaultSession): string {
  return text.replace(
    /\[\s*[a-z_]+\s*_\s*\d+\s*(?::\s*[a-z0-9 -]+\s*)?\]/gi,
    (token) => session.resolve(token) ?? token,
  );
}
