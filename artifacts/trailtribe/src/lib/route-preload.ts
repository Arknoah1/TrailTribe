const routeLoaders: Record<string, () => Promise<unknown>> = {
  "/calendar": () => import("../pages/calendar"),
  "/carpools": () => import("../pages/carpool-hub"),
  "/profile": () => import("../pages/profile"),
  "/volunteer": () => import("../pages/volunteer"),
  "/messages": () => import("../pages/messages"),
};

export function preloadRoute(path: string) {
  const loader = routeLoaders[path];
  if (loader) void loader();
}