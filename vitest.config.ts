import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // The first test of many files does `await import("@/server/...")` and
    // pays the cold transform of the whole server graph while ~200 files run
    // in parallel: 5-7s on a cold cache, over Vitest's 5s default. That was
    // the "flaky" suite — a timeout, not a logic failure.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  // tsconfig says `jsx: "preserve"` (Next compiles it). Tests that RENDER a
  // component need the automatic runtime, or every JSX file asks for a
  // global `React` that does not exist.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
