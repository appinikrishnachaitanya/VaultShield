import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  getRemoteConfig,
  fetchAndActivate,
  getValue,
} from "firebase/remote-config";
import { getAI, VertexAIBackend } from "firebase/ai";
import { androidAI, usesAndroidModel } from "../../services/androidNano";
const e = import.meta.env;
export const configured = Boolean(
  e.VITE_FIREBASE_API_KEY &&
  e.VITE_FIREBASE_PROJECT_ID &&
  e.VITE_FIREBASE_APP_ID,
);
export const app = configured
  ? initializeApp({
      apiKey: e.VITE_FIREBASE_API_KEY,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: e.VITE_FIREBASE_APP_ID,
    })
  : null;
if (
  !usesAndroidModel &&
  import.meta.env.DEV &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
)
  (
    self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }
  ).FIREBASE_APPCHECK_DEBUG_TOKEN = e.VITE_APPCHECK_DEBUG_TOKEN || true;
const appCheckProvider = usesAndroidModel
  ? new CustomProvider({
      async getToken() {
        try {
          return await androidAI.getAppCheckToken();
        } catch {
          console.warn("VaultShield Android App Check token unavailable");
          throw new Error(
            "Android Play Integrity could not provide an App Check token.",
          );
        }
      },
    })
  : e.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
    ? new ReCaptchaEnterpriseProvider(e.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY)
    : null;
export const appCheck =
  app && appCheckProvider
    ? initializeAppCheck(app, {
        provider: appCheckProvider,
        isTokenAutoRefreshEnabled: true,
      })
    : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const ai = app ? getAI(app, { backend: new VertexAIBackend("global") }) : null;
const defaults = {
  cloud_model_name: "gemini-3.5-flash-lite",
  enable_search_grounding: true,
};
export const remoteConfig = app ? getRemoteConfig(app) : null;
if (remoteConfig) {
  remoteConfig.defaultConfig = defaults;
  remoteConfig.settings.minimumFetchIntervalMillis = 3600000;
  remoteConfig.settings.fetchTimeoutMillis = 5000;
}
// Remap shut-down or non-existent model IDs to working equivalents
const MODEL_FIX: Record<string, string> = {
  "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
};
export const settings = () => {
  const raw = remoteConfig
    ? getValue(remoteConfig, "cloud_model_name").asString() || defaults.cloud_model_name
    : defaults.cloud_model_name;
  const model = MODEL_FIX[raw] ?? (raw || "gemini-3.5-flash-lite");
  return {
  model,
  grounding: remoteConfig
    ? getValue(remoteConfig, "enable_search_grounding").asBoolean()
    : true,
  };
};
export async function initializeServices() {
  if (!auth)
    throw new Error(
      "Firebase setup required. Add your project settings to .env.local.",
    );
  if (import.meta.env.PROD && !appCheck)
    throw new Error("App Check site key is required.");
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  if (remoteConfig) void fetchAndActivate(remoteConfig).catch(() => {});
}

