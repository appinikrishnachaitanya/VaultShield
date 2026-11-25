import { publicBodySpans } from "./publicBodies";
import type { SanitizedText } from "../types/privacy";
export type IdentifierCategory =
  | "PERSON"
  | "PHONE"
  | "BANK_ACC"
  | "UPI"
  | "AADHAAR"
  | "PAN"
  | "EMAIL"
  | "URL"
  | "AMOUNT"
  | "OTP"
  | "ORG"
  | "REFERENCE"
  | "IFSC"
  | "PRIVATE";
export type IdentifierMatch = {
  category: IdentifierCategory;
  value: string;
  start: number;
  end: number;
};
export function normalizePrivateText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}
/** One ordered detection layer shared by masking, tokenization and leak checks. Offsets refer to normalized text. */
export function detectIdentifiers(input: string): {
  text: string;
  matches: IdentifierMatch[];
} {
  const text = normalizePrivateText(input);
  const matches: IdentifierMatch[] = [];
  const publicBodies = publicBodySpans(text);
  const add = (category: IdentifierCategory, regex: RegExp, group = 0) => {
    for (const m of text.matchAll(regex)) {
      const value = m[group];
      if (
        category === "PERSON" &&
        group &&
        /^(?:team|sir|madam|customer|support|bank|officer)$/i.test(value.trim())
      )
        continue;
      const initialStart = m.index! + (group ? m[0].lastIndexOf(value) : 0);
      const initialEnd = initialStart + value.length;
      let candidates = [{ start: initialStart, end: initialEnd }];
      if (category === "PERSON" && group) {
        for (const body of publicBodies) {
          candidates = candidates.flatMap((span) =>
            body.end <= span.start || body.start >= span.end
              ? [span]
              : [
                  ...(body.start > span.start
                    ? [{ start: span.start, end: body.start }]
                    : []),
                  ...(body.end < span.end
                    ? [{ start: body.end, end: span.end }]
                    : []),
                ],
          );
        }
      }
      for (const candidate of candidates) {
        let { start, end } = candidate;
        if (category === "PERSON" && group) {
          while (start < end && /\s/.test(text[start])) start++;
          while (end > start && /\s/.test(text[end - 1])) end--;
        }
        if (start === end) continue;
        const value = text.slice(start, end);
        const overlapping = matches
          .filter((x) => start < x.end && end > x.start)
          .sort((a, b) => a.start - b.start);
        if (!overlapping.length) matches.push({ category, value, start, end });
        else if (category === "PERSON" || category === "ORG") {
          // Keep a labeled name even when the same field also contains a phone/account.
          // Previously detected categories retain their own tokens and route policy.
          let cursor = start;
          for (const occupied of overlapping) {
            if (occupied.start > cursor)
              matches.push({
                category,
                value: text.slice(cursor, occupied.start),
                start: cursor,
                end: occupied.start,
              });
            cursor = Math.max(cursor, occupied.end);
          }
          if (cursor < end)
            matches.push({
              category,
              value: text.slice(cursor, end),
              start: cursor,
              end,
            });
        }
      }
    }
  };
  add(
    "BANK_ACC",
    /\b(?:account(?:\s*(?:number|no\.?))?|a\/c(?:\s*(?:number|no\.?))?)\s*[:#=-]\s*(\d[\d -]{3,30}\d)\b/gi,
    1,
  );
  add(
    "REFERENCE",
    /\b(?:utr|transaction\s*(?:id|reference)|payment\s*(?:id|reference)|reference\s*(?:id|number|no\.?))\s*[:#=-]\s*((?=[A-Z0-9]*\d)[A-Z0-9]{6,35})\b/gi,
    1,
  );
  add("URL", /(?:https?:\/\/|www\.)[^\s<>"']+/gi);
  add("IFSC", /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi);
  add(
    "OTP",
    /\b(?:OTP|one[- ]time (?:password|code))\s*(?:is|:|-)?\s*\d(?:[ \t-]*\d){3,7}\b/gi,
  );
  add("AMOUNT", /(?:₹|\bINR\s*|\bRs\.?\s*)[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi);
  add("PHONE", /(?:\+91|\b91)[ \t-]*[6-9](?:[ \t-]*\d){9}\b/g);
  add("AADHAAR", /\b\d{4}[ \t-]*\d{4}[ \t-]*\d{4}\b/g);
  add("PAN", /\b[A-Z]{5}\d{4}[A-Z]\b/gi);
  for (const m of text.matchAll(/[\w.+-]+[ \t]*@[ \t]*[\w.-]+/g)) {
    const category: IdentifierCategory = /@\s*[^\s@]+\.[^\s@]+/.test(m[0])
      ? "EMAIL"
      : "UPI";
    const start = m.index!;
    const end = start + m[0].length;
    if (!matches.some((x) => start < x.end && end > x.start))
      matches.push({ category, value: m[0], start, end });
  }
  add("PHONE", /\b[6-9](?:[ \t-]*\d){9}\b/g);
  add("BANK_ACC", /\b\d[\d -]{11,22}\d\b/g);
  add("PERSON", /\b(?:name|customer|account holder)\s*:\s*[^\n,;]+/gi);
  add("ORG", /\b(?:client|company|employer)\s*:\s*[^\n,;]+/gi);
  // Contextual name heuristics: helpful on rules-only devices, never a complete NER check.
  add(
    "PERSON",
    /\b(?:[Mm]r\.?|[Mm]rs\.?|[Mm]s\.?|[Dd]r\.?|[Ii]nspector|[Oo]fficer|[Ss]hri|[Ss]mt\.?)\s+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})/g,
    1,
  );
  add(
    "PERSON",
    /\b(?:[Hh]i|[Hh]ello|[Dd]ear)\s+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2})/g,
    1,
  );
  add(
    "PERSON",
    /\b(?:[Mm]y\s+name\s+is|[Ii]\s+am|[Mm]era\s+naam|[Nn]aam(?:\s+hai)?)\s+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2})/g,
    1,
  );
  add("PERSON", /\bfrom\s+([A-Z][a-z]+[ \t]+[A-Z][a-z]+)(?=[,.!?\n]|\s|$)/g, 1);
  add(
    "PERSON",
    /मेरा\s*नाम\s+([\p{Script=Devanagari}]+(?:\s+[\p{Script=Devanagari}]+){0,2}?)(?=\s+है|[।,.!?\n]|$)/gu,
    1,
  );
  add(
    "PERSON",
    /\b(?:[Ss]tatement|[Ii]nvoice|[Oo]ffer[ \t]+letter|[Rr]eport)[ \t]+(?:for|of)[ \t]+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,2})/g,
    1,
  );
  const sorted = matches.sort((a, b) => a.start - b.start);
  const merged: IdentifierMatch[] = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous?.category === "PERSON" &&
      span.category === "PERSON" &&
      span.start >= previous.end &&
      /^[ \t]*$/.test(text.slice(previous.end, span.start))
    ) {
      previous.end = span.end;
      previous.value = text.slice(previous.start, span.end);
    } else merged.push({ ...span });
  }
  return { text, matches: merged };
}
// The brand is a compile-time aid. Review is still required before sending.
export function maskIdentifiers(input: string): {
  text: SanitizedText;
  count: number;
} {
  const detected = detectIdentifiers(input);
  let text = detected.text;
  for (const m of [...detected.matches].reverse())
    text = text.slice(0, m.start) + "[REDACTED]" + text.slice(m.end);
  return { text: text as SanitizedText, count: detected.matches.length };
}
export function hasAssessableText(input: string): boolean {
  const remaining = maskIdentifiers(input)
    .text.replace(
      /\[(?:REDACTED|MASKED|HIDDEN|[•*]+|[A-Z_]+_\d+(?::[^\]]+)?)\]/gi,
      "",
    )
    .replace(
      /^\s*(?:name|phone(?: number)?|mobile(?: number)?|aadhaar(?: number)?|pan|email|upi(?: id)?|account(?: number| no\.?)?|address)\s*[:|—-]?\s*$/gim,
      "",
    )
    .replace(
      /\b(?:name|phone(?: number)?|mobile(?: number)?|aadhaar(?: number)?|pan|email|upi(?: id)?|account(?: number| no\.?)?|address)\s*:/gi,
      "",
    )
    .replace(/[\s\p{P}\p{S}]/gu, "");
  return /[\p{L}\p{N}]/u.test(remaining);
}
