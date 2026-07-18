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
    typeCheck: true,
  },
});
