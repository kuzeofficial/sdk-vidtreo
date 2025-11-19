import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  server: {
    port: 5176,
    open: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  resolve: {
    alias: {
      "@vidtreo/recorder": resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: "../dist-dev",
    emptyOutDir: true,
  },
});
