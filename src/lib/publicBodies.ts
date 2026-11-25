/** Public-body names preserve authority evidence, not authenticity. This allowlist does not verify a sender. */
export function publicBodySpans(
  text: string,
): { start: number; end: number }[] {
  const patterns = [
    /\b(?:CBI|ED|RBI|TRAI|NPCI|SEBI|IRDAI|UIDAI|I4C|MHA|SBI|HDFC|ICICI)\b/g,
    /\b(?:(?:Mumbai|Delhi|Bengaluru|Bangalore|Hyderabad|Chennai|Kolkata|Pune|Lucknow|Maharashtra|Karnataka|Telangana|Tamil Nadu|Uttar Pradesh|Kerala|Gujarat|Rajasthan)\s+)?(?:Police(?:\s+Department)?|High Court|District Court|Sessions Court)\b/gi,
    /\b(?:Central Bureau of Investigation|Enforcement Directorate|Reserve Bank of India|Telecom Regulatory Authority of India|National Payments Corporation of India|Supreme Court(?: of India)?|State Bank(?: of India)?|Punjab National Bank|Bank of Baroda|HDFC Bank|ICICI Bank|Axis Bank|Kotak Mahindra Bank|Canara Bank|Union Bank(?: of India)?|Indian Bank|Income Tax Department|Cyber Crime Cell|Cybercrime Police|Consumer Court)\b/gi,
    /(?:मुंबई|दिल्ली)?\s*पुलिस|रिज़र्व बैंक|सुप्रीम कोर्ट|उच्च न्यायालय|सीबीआई/g,
  ];
  return patterns.flatMap((regex) =>
    Array.from(text.matchAll(regex), (m) => ({
      start: m.index!,
      end: m.index! + m[0].length,
    })),
  );
}
