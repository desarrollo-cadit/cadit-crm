import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // Dist dir del self-test E2E: es la MISMA salida de build que `.next`,
      // separada solo para que dos procesos de Next no peleen por el mismo
      // directorio (ver scripts/e2e-selftest.mjs).
      ".next-e2e/**",
      "dist/**",
      "drizzle/**",
      "scripts/**",
      "next-env.d.ts",
      // Bundles temporales de esbuild (seeds e importador): código generado.
      ".tmp-*.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
