import { useAuth } from "@clerk/nuxt/composables";

import {
  isLegacyDemoRequestRoute,
  isPublicAppRoute,
} from "~/utils/auth-routes";

export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  if (config.public.authProvider !== "clerk" || isPublicAppRoute(to.path)) {
    return;
  }

  // Clerk is intentionally client-owned because NestJS verifies API tokens.
  // Do not decide access from the first cold-loading snapshot.
  if (import.meta.server) return;

  const { isLoaded, isSignedIn } = useAuth();
  const deadline = Date.now() + 5_000;
  while (!isLoaded.value && Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  if (!isLoaded.value || !isSignedIn.value) {
    return navigateTo({
      path: "/sign-in",
      query: { redirect_url: to.fullPath },
    });
  }

  // RLY-2048 existed only in the original frontend fixture. Retired bookmarks
  // should recover through the owned request list instead of becoming a
  // permanent not-found navigation context.
  if (isLegacyDemoRequestRoute(to.path)) {
    return navigateTo("/dashboard", { replace: true });
  }
});
