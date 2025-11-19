import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/components/vidtreo-recorder.wc.ts"),
      name: "VidtreoRecorder",
      fileName: "vidtreo-recorder",
      formats: ["iife"],
    },
    outDir: "dist-wc",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "vidtreo-recorder.css";
          }
          return assetInfo.name || "asset";
        },
        entryFileNames: "vidtreo-recorder.js",
      },
    },
  },
  css: {
    postcss: "./postcss.config.ts",
  },
});
