import { Capacitor, registerPlugin } from "@capacitor/core";
export const usesAndroidModel =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export type AndroidModelStatus =
  "ready" | "unavailable" | "configurationMissing" | "timedOut" | "failed";

export const androidModelMessages = {
  ready: "Android local model ready.",
  unavailable: "Android's local model is unavailable on this device.",
  configurationMissing: "Android Firebase configuration is missing.",
  timedOut: "Android model preparation timed out. Try again.",
  failed: "Android couldn't prepare the local model. Try again.",
} satisfies Record<AndroidModelStatus, string>;

export const androidAI = registerPlugin<{
  checkStatus(input: {
    prepare: boolean;
  }): Promise<{ status: string; mlKitStatus?: number }>;
  analyze(input: {
    text: string;
    imageBase64?: string;
  }): Promise<{ status: string; text?: string }>;
  verifyReviewed(input: {
    prompt: string;
    consent: boolean;
    model: string;
    purpose: "hybrid" | "public-sources";
  }): Promise<{
    status: string;
    text?: string;
    source?: "ON_DEVICE" | "IN_CLOUD";
    durationMs?: number;
    metadata?: import("firebase/ai").GroundingMetadata;
  }>;
  getAppCheckToken(): Promise<{ token: string; expireTimeMillis: number }>;
  diagnostics(): Promise<{
    modelStatus: string;
    mlKitStatus?: number;
    lastError: string;
    lastErrorCode?: number;
    appCheck: string;
  }>;
  getSharedData(): Promise<{
    text?: string;
    image?: string;
    mimeType?: string;
    status?: string;
  }>;
  addListener(
    event: "shareReceived",
    callback: () => void,
  ): Promise<{ remove(): Promise<void> }>;
}>("VaultShieldNano");

let androidPreparation: Promise<AndroidModelStatus> | undefined;
export function prepareAndroidModel(): Promise<AndroidModelStatus> {
  androidPreparation ??= androidAI
    .checkStatus({ prepare: true })
    .then(({ status }): AndroidModelStatus => {
      if (status === "READY") return "ready";
      if (status === "TIMEOUT") return "timedOut";
      if (
        ["UNAVAILABLE", "FEATURE_NOT_FOUND", "NOT_SUPPORTED"].includes(status)
      )
        return "unavailable";
      return "failed";
    })
    .catch(() => "failed" as const)
    .finally(() => {
      androidPreparation = undefined;
    });
  return androidPreparation;
}
