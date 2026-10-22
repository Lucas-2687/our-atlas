import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/vendor/**",
  ]),
  // Keep inherited application lint debt visible without weakening new modules.
  {
    files: ["app/api/[[]...path]/route.ts", "app/atlas-app.tsx", "app/atlas-map.tsx", "app/map-access-panel.tsx", "app/share-map-preview.tsx", "lib/types.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  {
    files: ["app/atlas-app.tsx", "app/atlas-map.tsx"],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["app/atlas-app.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "warn" },
  },
  {
    files: ["app/atlas-map.tsx"],
    rules: { "react-hooks/refs": "warn" },
  },
]);

export default eslintConfig;
