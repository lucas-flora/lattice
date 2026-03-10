import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/wasm/pkg/**",
  ]),
  // Engine isolation rule — engine must have ZERO UI imports
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "Engine must not import React — engine is pure TypeScript with zero UI dependencies.",
            },
            {
              group: ["next", "next/*"],
              message: "Engine must not import Next.js — engine is pure TypeScript with zero UI dependencies.",
            },
            {
              group: ["three", "three/*", "@react-three/*"],
              message: "Engine must not import Three.js — rendering is a separate layer.",
            },
            {
              group: ["zustand", "zustand/*"],
              message: "Engine must not import Zustand — stores are a separate layer that mirrors engine state.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
