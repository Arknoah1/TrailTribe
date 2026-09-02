export const TRAILTEAM_TIME_ZONE = "America/Los_Angeles";

export function formatEventDateTime(startTime: Date): string {
  return startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TRAILTEAM_TIME_ZONE,
    timeZoneName: "short",
  });
}