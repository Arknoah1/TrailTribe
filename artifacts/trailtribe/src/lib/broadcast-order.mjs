function parseTimestamp(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function broadcastTimestamp(broadcast) {
  return parseTimestamp(broadcast.sentAt)
    ?? parseTimestamp(broadcast.createdAt)
    ?? Number.MIN_SAFE_INTEGER;
}

/** Newest sent broadcasts first, with creation time as a fallback and ID as a stable tie-break. */
export function compareBroadcastsNewestFirst(a, b) {
  const byDate = broadcastTimestamp(b) - broadcastTimestamp(a);
  if (byDate !== 0) return byDate;

  const aId = Number(a.id);
  const bId = Number(b.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return bId - aId;
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
}
