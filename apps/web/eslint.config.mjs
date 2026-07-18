import { baseConfig } from "@relay/eslint-config/base";
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  ...baseConfig,
  {
    ignores: [".nuxt/**", ".output/**", "coverage/**"],
  },
  {
    rules: {
      "vue/html-self-closing": [
        "error",
        {
          html: {
            void: "always",
          },
        },
      ],
      "vue/multi-word-component-names": "off",
    },
  },
);
