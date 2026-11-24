import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { ai } from "../lib/firebase/config";
import { prepareAndroidModel, usesAndroidModel } from "./androidNano";

export type Platform =
  | "capacitor-android"
  | "desktop-chrome"
  | "mobile-web"
  | "ios-web"
  | "unsupported";
export type Stage1Engine =
  "native-mlkit" | "chrome-nano" | "local-rules" | "blocked-screenshot";
type ModelStatus =
  "checking" | "available" | "downloadable" | "downloading" | "unavailable";
export type AICapability = {
  platform: Platform;
  modelStatus: ModelStatus;
  textEngine: Stage1Engine;
  screenshotEngine: Stage1Engine;
};

export const screenshotUnavailable =
  "Screenshot check needs On-Device AI. Please use text paste on this device, or use Desktop Chrome / Android App.";

export function detectAIPlatform(): Platform {
  if (usesAndroidModel) return "capacitor-android";
  if (Capacitor.isNativePlatform() || typeof navigator === "undefined")
    return "unsupported";
  const ua = navigator.userAgent ?? "";
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  )
    return "ios-web";
  if (/Android|Mobile/i.test(ua)) return "mobile-web";
  return /\bChrome\//.test(ua) && !/Edg\/|OPR\/|SamsungBrowser\//i.test(ua)
    ? "desktop-chrome"
    : "unsupported";
}

export function chromeModelOptions(image: boolean) {
  return {
    expectedInputs: image
      ? [
          { type: "text" as const, languages: ["en"] },
          { type: "image" as const },
        ]
      : [{ type: "text" as const, languages: ["en"] }],
    expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
  };
}

export async function chromeAvailability(image: boolean): Promise<ModelStatus> {
  if (
    detectAIPlatform() !== "desktop-chrome" ||
    !ai ||
    typeof window === "undefined"
  )
    return "unavailable";
  const model = (
    window as Window & {
      LanguageModel?: {
        create?: unknown;
        availability?: (
          options: ReturnType<typeof chromeModelOptions>,
        ) => Promise<string>;
      };
    }
  ).LanguageModel;
  if (
    typeof model?.availability !== "function" ||
    typeof model.create !== "function"
  )
    return "unavailable";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      model.availability(chromeModelOptions(image)),
      new Promise<"unavailable">((resolve) => {
        timer = setTimeout(() => resolve("unavailable"), 10000);
      }),
    ]);
    return status === "available" ||
      status === "downloadable" ||
      status === "downloading"
      ? status
      : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

function initialCapability(): AICapability {
  const platform = detectAIPlatform();
  return {
    platform,
    modelStatus:
      platform === "desktop-chrome" || platform === "capacitor-android"
        ? "checking"
        : "unavailable",
    textEngine: "local-rules",
    screenshotEngine: "blocked-screenshot",
  };
}

let cached: { expires: number; promise: Promise<AICapability> } | undefined;

export function readAICapability(): Promise<AICapability> {
  if (cached && cached.expires > Date.now()) return cached.promise;
  const initial = initialCapability();
  const promise = (async (): Promise<AICapability> => {
    if (initial.platform === "capacitor-android") {
      const native = await prepareAndroidModel();
      return native === "ready"
        ? {
            ...initial,
            modelStatus: "available",
            textEngine: "native-mlkit",
            screenshotEngine: "native-mlkit",
          }
        : { ...initial, modelStatus: "unavailable" };
    }
    if (initial.platform === "desktop-chrome") {
      const [text, image] = await Promise.all([
        chromeAvailability(false),
        chromeAvailability(true),
      ]);
      return {
        ...initial,
        modelStatus: text,
        textEngine: text === "unavailable" ? "local-rules" : "chrome-nano",
        screenshotEngine:
          image === "unavailable" ? "blocked-screenshot" : "chrome-nano",
      };
    }
    return initial;
  })();
  cached = { expires: Date.now() + 5000, promise };
  return promise;
}

export function useAICapability() {
  const [capability, setCapability] = useState(initialCapability);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void readAICapability().then((value) => {
        if (active) setCapability(value);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("vaultshield:model-status", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("vaultshield:model-status", refresh);
    };
  }, []);
  return capability;
}

export function refreshAICapability() {
  cached = undefined;
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  )
    window.dispatchEvent(new Event("vaultshield:model-status"));
}

export function capabilityLabel({ platform, modelStatus }: AICapability) {
  if (platform === "mobile-web" || platform === "ios-web")
    return "Mobile browser · Private local rules";
  if (modelStatus === "checking")
    return platform === "capacitor-android"
      ? "Android AI · Checking…"
      : "Desktop AI · Checking…";
  if (modelStatus === "available")
    return platform === "capacitor-android"
      ? "Native on-device AI · Ready"
      : "Desktop on-device AI · Ready";
  if (modelStatus === "downloadable")
    return "Desktop AI · Model download needed";
  if (modelStatus === "downloading") return "Desktop AI · Downloading";
  return "Private local rules · Text only";
}
