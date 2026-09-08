export type EventAudience = {
  podIds: string[] | null;
  isAllTeam: boolean;
};

export type EventAudienceUser = {
  role: string;
  podId: string | null;
};

/**
 * The canonical event audience rule used by every visibility and delivery path.
 * Staff can access every event. Other members can access team-wide events or
 * events assigned to their pod.
 *
 * Empty legacy pod lists are treated as team-wide so older events retain their
 * established audience even when `isAllTeam` was not populated consistently.
 */
export function isEventAudienceMember(
  event: EventAudience,
  user: EventAudienceUser,
): boolean {
  if (user.role === "coach" || user.role === "super_admin") return true;
  if (event.isAllTeam || !event.podIds || event.podIds.length === 0) return true;
  return user.podId != null && event.podIds.includes(user.podId);
}