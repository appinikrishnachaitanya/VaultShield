// Product switches are not device capability claims. Runtime probes determine
// availability; unavailable tools explain why and never silently use cloud.
export const FEATURES = {
  SCREENSHOT_AI: true,
  FAMILY_FCM: true,
  CONTRACT_PRO_MODE: true,
  LOCAL_TOOLS_DRAWER: true,
  MAA_AI_SUMMARY: true,
  PUBLIC_SOURCE_VERIFY: true,
  DEMO_MODE: false,
} as const;
