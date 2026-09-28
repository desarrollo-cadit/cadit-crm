import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
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
