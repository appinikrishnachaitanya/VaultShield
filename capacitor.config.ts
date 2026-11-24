import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "in.vaultshield.app",
  appName: "VaultShield",
  webDir: "dist",
  server: { hostname: "vaultshield.localhost" },
  android: { allowMixedContent: false, loggingBehavior: "none" },
};
export default config;
