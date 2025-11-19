# SDK-2 Monorepo

A monorepo for Vidtreo SDK packages, managed with Bun workspaces and configured with Ultracite for code formatting and linting.

## Structure

```
sdk-2/
├── packages/          # All packages live here
│   └── example/       # Example package structure
├── package.json       # Root workspace configuration
├── biome.jsonc        # Ultracite/Biome configuration
├── tsconfig.json      # TypeScript base configuration
└── .github/
    └── workflows/
        └── publish.yml # GitHub Actions for npm publishing
```

## Getting Started

### Installation

```bash
bun install
```

### Development

```bash
# Build all packages (parallel execution)
bun run build

# Build in development mode
bun run build:dev

# Build in production mode (with minification)
bun run build:prod

# Build only JavaScript bundles
bun run build:js

# Build only TypeScript declarations
bun run build:types

# Run all tests (lightning fast with parallel execution)
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Run tests for specific packages
bun run test:packages

# Lint code
bun run lint

# Format code
bun run format

# Check and fix code
bun run check
```

## Build Optimizations

This monorepo uses Bun's most efficient compilation methods:

1. **Parallel Builds**: All packages build in parallel using Bun's native `--parallel` flag
2. **External Dependencies**: Dependencies are marked as external (`--packages external`) to avoid bundling them
3. **Source Maps**: External source maps are generated for better debugging
4. **TypeScript**: Native TypeScript compilation with declaration file generation
5. **Minification**: Granular minification options for production builds (whitespace, identifiers, syntax)
6. **Caching**: GitHub Actions workflow includes dependency caching for faster builds

## Adding a New Package

1. Create a new directory in `packages/`
2. Add a `package.json` with the package configuration
3. Create a `tsconfig.json` that extends the root config
4. Add build scripts following the example package pattern
5. The package will automatically be included in the workspace

### Package Build Scripts

Each package should have these scripts:

```json
{
  "scripts": {
    "build": "bun run build:js && bun run build:types",
    "build:js": "bun build ./src/index.ts --outdir ./dist --target node --format esm --packages external --sourcemap external",
    "build:dev": "bun build ./src/index.ts --outdir ./dist --target node --format esm --packages external --sourcemap external",
    "build:prod": "bun build ./src/index.ts --outdir ./dist --target node --format esm --packages external --sourcemap external --minify-whitespace --minify-identifiers --minify-syntax",
    "build:types": "bunx tsc --emitDeclarationOnly --declaration --outDir dist --declarationMap",
    "clean": "rm -rf dist"
  }
}
```

## Testing

This monorepo uses Bun's native test runner for lightning-fast test execution:

### Features

1. **Parallel Execution**: Tests run concurrently across all test files by default
2. **Native Speed**: Bun's test runner is built-in and optimized for performance
3. **TypeScript Support**: Full TypeScript support without compilation step
4. **Coverage**: Built-in code coverage support
5. **Watch Mode**: Automatic test re-running on file changes

### Test Structure

```
packages/
  └── example/
      └── tests/
          ├── setup.ts          # Global test setup
          ├── unit/             # Unit tests
          │   └── *.test.ts
          ├── integration/      # Integration tests
          │   └── *.test.ts
          └── helpers/          # Test utilities
              └── test-utils.ts
```

### Writing Tests

Tests use Bun's native `bun:test` API:

```typescript
import { describe, expect, test } from "bun:test";

describe("MyFeature", () => {
  test("should work correctly", () => {
    expect(true).toBe(true);
  });
});
```

### Test Configuration

Test configuration is in `bunfig.toml`:
- `concurrent = true`: Run tests in parallel
- `maxConcurrency = 20`: Maximum concurrent tests
- `timeout = 30000`: Test timeout (30 seconds)

## Publishing

Packages are automatically published to npm via GitHub Actions when changes are pushed to the main branch. The workflow:

- Detects changed packages automatically
- Builds all packages in parallel
- Publishes only packages with non-zero versions
- Skips packages that already exist on npm

