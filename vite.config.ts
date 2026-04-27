import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["better-sqlite3", "uiohook-napi", "electron"],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              // Force CJS so require("electron") works in the preload context.
              // The app's "type":"module" makes .mjs the default, but .cjs
              // always means CommonJS regardless of package type.
              output: {
                entryFileNames: "[name].cjs",
                format: "cjs",
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
