import { afterAll, beforeAll } from "bun:test";

// Global test setup
beforeAll(() => {
  // Setup global test environment
  // Add any global mocks or configurations here
});

afterAll(() => {
  // Cleanup after all tests
  // Force garbage collection if available
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun is a global in Bun runtime
  if (typeof Bun !== "undefined" && Bun.gc) {
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun.gc is a global in Bun runtime
    Bun.gc(true);
  }
});
