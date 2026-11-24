import type { SanitizedText } from "../types/privacy";
// This constructor stays internal to the local privacy pipeline. The brand is a compile-time aid, not proof that an LLM found every identifier.
export function maskIdentifiers(input: string): {
  text: SanitizedText;
  count: number;
} {
  let count = 0;
  const replace = () => {
    count++;
    return "[REDACTED]";
  };
  const text = input
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u0966-\u096F]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0966),
    )
    .replace(
      /(\b(?:account(?:\s*(?:number|no\.?))?|a\/c(?:\s*(?:number|no\.?))?)\s*[:#=-]\s*)\d[\d -]{3,30}\d\b/gi,
      (_match, label: string) => label + replace(),
    )
    .replace(
      /(\b(?:utr|transaction\s*(?:id|reference)|payment\s*(?:id|reference)|reference\s*(?:id|number|no\.?))\s*[:#=-]\s*)(?=[A-Z0-9]*\d)[A-Z0-9]{6,35}\b/gi,
      (_match, label: string) => label + replace(),
    )
    .replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, replace)
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, replace)
    .replace(
      /\b(?:OTP|one[- ]time (?:password|code))\s*(?:is|:|-)?\s*\d(?:[ \t-]*\d){3,7}\b/gi,
      replace,
    )
    .replace(
      /(?:₹|\bINR\s*|\bRs\.?\s*)[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi,
      replace,
    )
    .replace(/(?:\+91|\b91)[ \t-]*[6-9](?:[ \t-]*\d){9}\b/g, replace)
    .replace(/\b\d{4}[ \t-]*\d{4}[ \t-]*\d{4}\b/g, replace)
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, replace)
    .replace(/[\w.+-]+[ \t]*@[ \t]*[\w.-]+/g, replace)
    .replace(/\b[6-9](?:[ \t-]*\d){9}\b/g, replace)
    .replace(/\b\d[\d -]{11,22}\d\b/g, replace)
    .replace(/\b(?:name|customer|account holder)\s*:\s*[^\n,;]+/gi, replace);
  return { text: text as SanitizedText, count };
}
