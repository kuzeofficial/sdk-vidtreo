import { readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

const distDir = join(process.cwd(), "dist");
const typesFile = join(distDir, "core/processor/types.d.ts");
const configFile = join(distDir, "core/processor/config.d.ts");
const processorFile = join(distDir, "core/processor/processor.d.ts");
const outputFile = join(distDir, "index.d.ts");

const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--prod");
const isDev = process.argv.includes("--dev");

if (!existsSync(typesFile) || !existsSync(configFile) || !existsSync(processorFile)) {
  console.error("Error: Type declaration files not found. Run build:types first.");
  process.exit(1);
}

const types = readFileSync(typesFile, "utf-8");
const config = readFileSync(configFile, "utf-8").replace(
  'import type { TranscodeConfig } from "./types";\n',
  ""
);
const processor = readFileSync(processorFile, "utf-8").replace(
  'import type { TranscodeConfig, TranscodeInput, TranscodeResult } from "./types";\n',
  ""
);

const merged = [types, config, processor].join("\n\n");

writeFileSync(outputFile, merged);
rmSync(join(distDir, "core"), { recursive: true, force: true });

if (!isDev) {
  const jsMapFile = join(distDir, "index.js.map");
  const dtsMapFile = join(distDir, "index.d.ts.map");
  if (existsSync(jsMapFile)) unlinkSync(jsMapFile);
  if (existsSync(dtsMapFile)) unlinkSync(dtsMapFile);
  if (isProduction) {
    console.log("✓ Flattened type declarations into index.d.ts");
    console.log("✓ Removed core folder");
    console.log("✓ Removed source maps (production build)");
  } else {
    console.log("✓ Flattened type declarations into index.d.ts");
    console.log("✓ Removed core folder");
    console.log("✓ Removed source maps");
  }
} else {
  console.log("✓ Flattened type declarations into index.d.ts");
  console.log("✓ Removed core folder");
  console.log("ℹ Source maps kept for development");
}

