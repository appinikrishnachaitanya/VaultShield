export type SanitizedText = string & { readonly __brand: "SanitizedText" };
export type Stage = {
  name: "Authority" | "Fear" | "Urgency" | "Secrecy";
  found: boolean;
  evidence: string;
  action: string;
};
export type LocalResult = {
  text: SanitizedText;
  stages: Stage[];
  masked: number;
  imageMismatches?: string[];
  durationMs: number;
  source: "ON_DEVICE" | "LOCAL_RULES";
};
