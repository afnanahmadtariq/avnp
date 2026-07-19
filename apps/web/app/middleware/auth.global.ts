import { useAuth } from "@clerk/nuxt/composables";

const publicRoutes = new Set(["/", "/sign-in", "/sign-up"]);

export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  if (config.public.authProvider !== "clerk" || publicRoutes.has(to.path)) {
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
});
