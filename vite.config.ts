import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
  ],
}));
