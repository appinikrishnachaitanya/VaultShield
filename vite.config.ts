import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === "android" ? "dist-android" : "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@firebase/firestore"))
            return "firebase-firestore";
          if (id.includes("node_modules/@firebase/auth"))
            return "firebase-auth";
          if (id.includes("node_modules/@firebase/ai")) return "firebase-ai";
          if (id.includes("node_modules/@firebase/"))
            return "firebase-platform";
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    mode !== "android" &&
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["shield.svg"],
        manifest: {
          name: "VaultShield",
          short_name: "VaultShield",
          description: "Check it before you pay for it. Privately.",
          theme_color: "#0f766e",
          background_color: "#f8fafc",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/shield.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
          ],
          // A browser can send a share POST to Hosting if no worker intercepts it.
          // Keep raw share intake native; the web app accepts paste and file input.
        },
        workbox: {
          importScripts: ["/firebase-messaging-sw.js"],
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{js,css,html,svg}"],
          runtimeCaching: [],
        },
      }),
  ],
}));
