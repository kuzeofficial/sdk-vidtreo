import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const distDir = join(process.cwd(), "dist");
const outputFile = join(distDir, "index.d.ts");

const isProduction =
  process.env.NODE_ENV === "production" || process.argv.includes("--prod");
const isDev = process.argv.includes("--dev");

function findDeclarationFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    if (entry === "index.d.ts" || entry.endsWith(".map")) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findDeclarationFiles(fullPath));
    } else if (entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function cleanDeclarationContent(content: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(
    /import\s+(?:type\s+)?{[^}]+}\s+from\s+["']\.\/[^"']+["'];\s*\n/g,
    ""
  );

  cleaned = cleaned.replace(
    /import\s+[^"']+\s+from\s+["']\.\/[^"']+["'];\s*\n/g,
    ""
  );

  cleaned = cleaned.replace(/\/\/#\s+sourceMappingURL=[^\n]+\n?/g, "");

  return cleaned.trim();
}

if (!existsSync(distDir)) {
  console.error("Error: dist directory not found. Run build:types first.");
  process.exit(1);
}

const declarationFiles = findDeclarationFiles(distDir);

if (declarationFiles.length === 0) {
  console.error("Error: No declaration files found. Run build:types first.");
  process.exit(1);
}

const contents: string[] = [];

for (const file of declarationFiles) {
  const content = readFileSync(file, "utf-8");
  const cleaned = cleanDeclarationContent(content);
  if (cleaned) {
    contents.push(cleaned);
  }
}

const merged = contents.join("\n\n");
writeFileSync(outputFile, merged);

// Remove ALL subdirectories in dist (except web component directories)
// This ensures we remove empty folders and any remaining structure
function removeAllSubdirs(dir: string, rootDir: string, excludeDirs: Set<string>): number {
  if (!existsSync(dir)) {
    return 0;
  }

  let removedCount = 0;
  const entries = readdirSync(dir);

  // First, recursively process subdirectories
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (!existsSync(fullPath)) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip excluded directories (like wc for web components)
      const baseName = entry;
      if (!excludeDirs.has(baseName) && !excludeDirs.has(fullPath)) {
        // Recursively remove subdirectories first
        removedCount += removeAllSubdirs(fullPath, rootDir, excludeDirs);
      }
    }
  }

  // Then remove directories at this level (after subdirectories are removed)
  const remainingEntries = readdirSync(dir);
  for (const entry of remainingEntries) {
    const fullPath = join(dir, entry);
    if (!existsSync(fullPath)) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip excluded directories and the root directory itself
      const baseName = entry;
      if (fullPath !== rootDir && !excludeDirs.has(baseName) && !excludeDirs.has(fullPath)) {
        rmSync(fullPath, { recursive: true, force: true });
        removedCount++;
      }
    }
  }

  return removedCount;
}

// Remove all subdirectories (excluding web component directories)
const excludeDirs = new Set<string>(["wc"]);
const removedCount = removeAllSubdirs(distDir, distDir, excludeDirs);

if (isDev) {
  console.log("✓ Flattened type declarations into index.d.ts");
  console.log(`✓ Removed ${removedCount} folder(s)`);
  console.log("ℹ Source maps kept for development");
} else {
  const jsMapFile = join(distDir, "index.js.map");
  const dtsMapFile = join(distDir, "index.d.ts.map");
  if (existsSync(jsMapFile)) {
    unlinkSync(jsMapFile);
  }
  if (existsSync(dtsMapFile)) {
    unlinkSync(dtsMapFile);
  }
  if (isProduction) {
    console.log("✓ Flattened type declarations into index.d.ts");
    console.log(`✓ Removed ${removedCount} folder(s)`);
    console.log("✓ Removed source maps (production build)");
  } else {
    console.log("✓ Flattened type declarations into index.d.ts");
    console.log(`✓ Removed ${removedCount} folder(s)`);
    console.log("✓ Removed source maps");
  }
}
