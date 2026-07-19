import type { ModuleOptions as ClerkModuleOptions } from "@clerk/nuxt";
import { defineNuxtConfig } from "nuxt/config";

const clerkEnabled = Boolean(
  process.env.AUTH_PROVIDER?.trim().toLowerCase() === "clerk" &&
  process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);
const clerkPublishableKey =
  process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

const clerkModule: [string, ClerkModuleOptions] = [
  "@clerk/nuxt",
  {
    afterSignOutUrl: "/",
    // NestJS owns bearer-token verification. Skipping Nuxt's server middleware
    // keeps browser and API auth responsibilities clear.
    publishableKey: clerkPublishableKey,
    skipServerMiddleware: true,
    signInFallbackRedirectUrl: "/dashboard",
    signInUrl: "/sign-in",
    signUpFallbackRedirectUrl: "/profile?welcome=1",
    signUpUrl: "/sign-up",
  },
];

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
  modules: ["@nuxt/eslint", ...(clerkEnabled ? [clerkModule] : [])],
  runtimeConfig: {
    public: {
      apiBase:
        process.env.NUXT_PUBLIC_API_BASE?.trim() ||
        "http://localhost:4000/api/v1",
      authProvider: clerkEnabled ? "clerk" : "local",
      clerk: {
        publishableKey: clerkPublishableKey,
      },
    },
  },
  routeRules: {
    "/": {
      prerender: true,
    },
    "/account": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/account/**": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/dashboard": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/privacy": {
      prerender: true,
    },
    "/profile": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/requests/**": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/settings": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/sign-in": {
      headers: { "x-robots-tag": "noindex, nofollow" },
    },
    "/sign-in/**": {
      headers: { "x-robots-tag": "noindex, nofollow" },
    },
    "/sign-up": {
      headers: { "x-robots-tag": "noindex, nofollow" },
    },
    "/sign-up/**": {
      headers: { "x-robots-tag": "noindex, nofollow" },
    },
    "/start": {
      headers: { "x-robots-tag": "noindex, nofollow" },
      ssr: false,
    },
    "/support": {
      prerender: true,
    },
    "/terms": {
      prerender: true,
    },
  },
  typescript: {
    strict: true,
    typeCheck: "build",
  },
});
