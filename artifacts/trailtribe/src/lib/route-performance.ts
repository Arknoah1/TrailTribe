import { useEffect, useRef } from "react";

export type RoutePerformanceMilestone = "first-useful-content" | "interactive";

const START_PREFIX = "trailtribe:route-start:";
export const ANDROID_CHROME_TARGETS_MS: Record<RoutePerformanceMilestone, number> = {
  "first-useful-content": 1_500,
  interactive: 3_000,
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export function markRouteStart(route: string) {
  if (typeof performance === "undefined") return;
  performance.mark(`${START_PREFIX}${route}`);
}

export function reportRouteMilestone(route: string, milestone: RoutePerformanceMilestone) {
  if (typeof performance === "undefined") return;
  const starts = performance.getEntriesByName(`${START_PREFIX}${route}`);
  const start = starts[starts.length - 1];
  if (!start) return;
  const key = `trailtribe:route:${route}:${milestone}`;
  if (performance.getEntriesByName(key).length > 0) return;
  const duration = Math.round(now() - start.startTime);
  performance.mark(key);
  performance.measure(key, `${START_PREFIX}${route}`, key);
  // User Timing entries are available in Android Chrome's performance tools.
  // The console record makes the same measurement easy to collect remotely.
  console.info("[TrailTribe performance]", {
    route,
    milestone,
    durationMs: duration,
    targetMs: ANDROID_CHROME_TARGETS_MS[milestone],
    withinTarget: duration <= ANDROID_CHROME_TARGETS_MS[milestone],
  });
}

export function useRoutePerformance(route: string, ready: boolean, interactive: boolean) {
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      markRouteStart(route);
    }
  }, [route]);
  useEffect(() => {
    if (ready) reportRouteMilestone(route, "first-useful-content");
  }, [route, ready]);
  useEffect(() => {
    if (interactive) reportRouteMilestone(route, "interactive");
  }, [route, interactive]);
}