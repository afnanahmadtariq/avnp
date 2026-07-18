import eslint from "@eslint/js";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

const codeFiles = ["**/*.{js,mjs,cjs,ts,mts,cts}"];

/** @type {import("eslint").Linter.Config[]} */
export const baseConfig = [
  {
    ignores: [
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/generated/**",
      "**/node_modules/**",
    ],
  },
  { ...eslint.configs.recommended, files: codeFiles },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: codeFiles,
  })),
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
];

export default baseConfig;
