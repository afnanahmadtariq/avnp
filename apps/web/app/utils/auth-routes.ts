export function isPublicAppRoute(path: string): boolean {
  const normalizedPath =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  return (
    normalizedPath === "/" ||
    normalizedPath === "/privacy" ||
    normalizedPath === "/sign-in" ||
    normalizedPath.startsWith("/sign-in/") ||
    normalizedPath === "/sign-up" ||
    normalizedPath.startsWith("/sign-up/") ||
    normalizedPath === "/support" ||
    normalizedPath === "/terms"
  );
}

export function isLegacyDemoRequestRoute(path: string): boolean {
  return (
    path === "/requests/RLY-2048" || path.startsWith("/requests/RLY-2048/")
  );
}
