import globals from "globals";

import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const browserConfig = [
  ...baseConfig,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
];

export default browserConfig;
