import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  app: {
    head: {
      htmlAttrs: {
        lang: "en",
      },
      link: [
        {
          href: "/brand/relay-mark.svg",
          rel: "icon",
          type: "image/svg+xml",
        },
      ],
      meta: [
        {
          content: "width=device-width, initial-scale=1",
          name: "viewport",
        },
        {
          content: "#f5f4ef",
          name: "theme-color",
        },
      ],
    },
    pageTransition: {
      mode: "out-in",
      name: "page",
    },
  },
  compatibilityDate: "2026-07-19",
  css: ["@relay/ui/styles.css", "~/assets/css/main.css"],
  devtools: {
    enabled: false,
  },
  hooks: {
    "app:resolve": (app) => {
      // Nuxt 4.5 misclassifies this bundled diagnostic's re-exported default.
      app.plugins = app.plugins.filter(
        (plugin) =>
          !plugin.src
            .replaceAll("\\", "/")
            .includes("/nuxt/dist/pages/runtime/plugins/check-if-page-unused"),
      );
    },
  },
  modules: ["@nuxt/eslint"],
  runtimeConfig: {
    public: {
      apiBase: "http://localhost:4000/api/v1",
    },
  },
  routeRules: {
    "/": {
      prerender: true,
    },
  },
  typescript: {
    strict: true,
    typeCheck: "build",
  },
});
