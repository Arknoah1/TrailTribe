export type EventAudience = {
  podIds: string[] | null;
  isAllTeam: boolean;
};

export type EventAudienceUser = {
  role: string;
  podId: string | null;
};

export class EventAudienceConflictError extends Error {
  constructor() {
    super("Team-wide events cannot also target specific pods");
    this.name = "EventAudienceConflictError";
  }
}

/**
 * Canonicalizes audience values before an event is written.
 *
 * Legacy conflicting rows remain supported by the read rule below, but new
 * writes must choose either the whole team or one or more specific pods.
 */
export function normalizeEventAudience(event: EventAudience): EventAudience {
  const podIds = event.podIds
    ? [...new Set(event.podIds.filter((podId) => podId.length > 0))]
    : null;

  if (event.isAllTeam && podIds && podIds.length > 0) {
    throw new EventAudienceConflictError();
  }

  return {
    isAllTeam: event.isAllTeam,
    podIds: podIds && podIds.length > 0 ? podIds : null,
  };
}

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