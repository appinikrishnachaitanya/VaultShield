import { detectIdentifiers, normalizePrivateText } from "./privacy";
export type RouteTier = "LOCAL_ONLY" | "TOKENIZE_THEN_CLOUD_OK" | "LOW_RISK";
export type PrivacyRoute = {
  tier: RouteTier;
  reasons: string[];
  overrideAllowed?: boolean;
};
export function routeInput(input: string, hasImage = false): PrivacyRoute {
  const { matches } = detectIdentifiers(input);
  const text = normalizePrivateText(input);
  const reasons = new Set<string>();
  for (const m of matches)
    if (["AADHAAR", "PAN"].includes(m.category)) reasons.add(m.category);
  for (const category of ["AADHAAR", "PAN"])
    if (new RegExp("\\[" + category + "_\\d+", "i").test(text))
      reasons.add(category);
  // Document evidence requires structure and multiple fields, not a topic keyword in a message.
  const medicalFields = [
    /\bpatient\s*(?:name|id|:)/i,
    /\b(?:diagnosis|prescription|test results?)\s*:/i,
    /\b(?:haemoglobin|hemoglobin|glucose|platelet|cholesterol)\s*:/i,
    /\b(?:reference\s*range|mg\/dl|g\/dl|mmol\/l)\b/i,
  ].filter((r) => r.test(text)).length;
  if (
    medicalFields >= 2 &&
    /(?:medical|lab|pathology|blood\s*test)\s*(?:report|record)|patient\s*(?:name|id)\s*:/i.test(
      text,
    )
  )
    reasons.add("Medical document");
  const statementFields = [
    /opening\s*balance/i,
    /closing\s*balance/i,
    /\b(?:debit|credit)\b/i,
    /transaction\s*(?:date|history|details)/i,
  ].filter((r) => r.test(text)).length;
  if (
    statementFields >= 2 &&
    /bank\s*statement|statement\s*of\s*account/i.test(text)
  )
    reasons.add("Bank statement");
  const identityFields = [
    /\b(?:dob|date\s*of\s*birth)\s*:/i,
    /\baddress\s*:/i,
    /\b(?:gender|issued|expiry)\s*:/i,
    /\b(?:id|document)\s*(?:number|no)\s*:/i,
  ].filter((r) => r.test(text)).length;
  if (
    identityFields >= 2 &&
    /(?:^|\n)\s*(?:aadhaar|pan|passport|identity|identification|kyc)\s*(?:card|document|certificate|scan)?\s*[:\n]/i.test(
      text,
    )
  )
    reasons.add("Identity document");
  if (
    /(?:student|school)\s*record/i.test(text) &&
    /\bage\s*:\s*(?:[0-9]|1[0-7])\b/i.test(text) &&
    /(?:name|student\s*id)\s*:/i.test(text)
  )
    reasons.add("Minor-related document");
  if (hasImage) reasons.add("Image awaiting local extraction");
  if (reasons.size)
    return {
      tier: "LOCAL_ONLY",
      reasons: [...reasons],
      overrideAllowed: !hasImage,
    };
  const categories = [...new Set(matches.map((m) => m.category))];
  const mention =
    /aadhaar|aadhar|\bpan\b|\bchild(?:ren|'s)?\b|patient|account\s*number|medical\s*report|bank\s*statement|kyc\s*document|आधार|बच्च|रोगी/i.test(
      text,
    );
  if (
    categories.length ||
    mention ||
    /\[[A-Z_]+_\d+/i.test(text) ||
    /\b(?:contract|agreement|invoice|offer\s*letter)\b|अनुबंध|चालान/i.test(text)
  )
    return {
      tier: "TOKENIZE_THEN_CLOUD_OK",
      reasons: categories.length
        ? categories
        : [mention ? "Topic mention only" : "Reviewed document"],
    };
  return { tier: "LOW_RISK", reasons: ["No identifiers detected"] };
}
export function cloudRouteBlocked(route: PrivacyRoute, override = false) {
  return route.tier === "LOCAL_ONLY" && !(override && route.overrideAllowed);
}
export function assertCloudRoute(route: PrivacyRoute, override = false) {
  if (cloudRouteBlocked(route, override))
    throw new Error(
      "This content stays on this device. Cloud actions are disabled.",
    );
}
