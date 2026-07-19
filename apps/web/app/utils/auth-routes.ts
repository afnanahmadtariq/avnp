export function isPublicAppRoute(path: string): boolean {
  return (
    path === "/" ||
    path === "/sign-in" ||
    path.startsWith("/sign-in/") ||
    path === "/sign-up" ||
    path.startsWith("/sign-up/")
  );
}

export function isLegacyDemoRequestRoute(path: string): boolean {
  return (
    path === "/requests/RLY-2048" || path.startsWith("/requests/RLY-2048/")
  );
}
