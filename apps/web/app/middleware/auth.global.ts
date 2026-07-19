import { useAuth } from "@clerk/nuxt/composables";

const publicRoutes = new Set(["/", "/sign-in", "/sign-up"]);

export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig();
  if (config.public.authProvider !== "clerk" || publicRoutes.has(to.path)) {
    return;
  }

  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded.value && !isSignedIn.value) {
    return navigateTo({
      path: "/sign-in",
      query: { redirect_url: to.fullPath },
    });
  }
});
