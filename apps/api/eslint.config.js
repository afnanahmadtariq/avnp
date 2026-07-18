import { nodeConfig } from "@relay/eslint-config/node";

export default [
  ...nodeConfig,
  {
    ignores: ["coverage/**", "dist/**"],
  },
];
