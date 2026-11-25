export type SanitizedText = string & { readonly __brand: "SanitizedText" };
export type Stage = {
  name: "Authority" | "Fear" | "Urgency" | "Secrecy";
  found: boolean;
  evidence: string;
  action: string;
  assessmentSource?: "ON_DEVICE" | "IN_CLOUD" | "LOCAL_RULES";
  assessedByAI?: boolean;
};
export type LocalResult = {
  text: SanitizedText;
  stages: Stage[];
  masked: number;
  imageMismatches?: string[];
  durationMs: number;
  source: "ON_DEVICE" | "IN_CLOUD" | "LOCAL_RULES";
  fallbackReason?: string;
  fallbackStage?: string;
  fallbackCode?: string;
  ruleAssisted?: boolean;
  preparationMs?: number;
  generationMs?: number;
  requestPayload?: SanitizedText;
  cloudModel?: string;
};
