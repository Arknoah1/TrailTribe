import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBroadcastsNewestFirst } from "./broadcast-order.mjs";

const broadcast = (id, sentAt, createdAt, archivedAt = null) => ({
  id,
  sentAt,
  createdAt,
  archivedAt,
});

test("sorts by sent date newest-first and uses creation date when sentAt is absent", () => {
  const rows = [
    broadcast(1, "2026-01-01T12:00:00Z", "2026-01-01T10:00:00Z"),
    broadcast(2, "2026-01-03T12:00:00Z", "2026-01-02T10:00:00Z"),
    broadcast(3, null, "2026-01-04T10:00:00Z"),
    broadcast(4, "2026-01-02T12:00:00Z", "2026-01-05T10:00:00Z"),
  ];

  assert.deepEqual([...rows].sort(compareBroadcastsNewestFirst).map(({ id }) => id), [3, 2, 4, 1]);
  assert.deepEqual(rows.map(({ id }) => id), [1, 2, 3, 4], "sorting a copy must not mutate the API result");
});

test("uses creation date when sentAt is invalid and consistently breaks equal or invalid dates by ID", () => {
  const rows = [
    broadcast(1, "not-a-date", "2026-01-01T00:00:00Z"),
    broadcast(8, "2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
    broadcast(5, "2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
    broadcast(3, null, "also-not-a-date"),
    broadcast(7, null, null),
  ];

  assert.deepEqual([...rows].sort(compareBroadcastsNewestFirst).map(({ id }) => id), [8, 5, 1, 7, 3]);
});

test("accepts Date objects returned by the parsed API client", () => {
  const rows = [
    broadcast(1, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z")),
    broadcast(2, null, new Date("2026-01-02T00:00:00Z")),
  ];
  assert.deepEqual([...rows].sort(compareBroadcastsNewestFirst).map(({ id }) => id), [2, 1]);
});

test("active and archived messages sort independently without mixing sections", () => {
  const rows = [
    broadcast(1, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    broadcast(2, "2026-01-03T00:00:00Z", "2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"),
    broadcast(3, "2026-01-02T00:00:00Z", "2026-01-02T00:00:00Z"),
    broadcast(4, "2026-01-01T12:00:00Z", "2026-01-01T12:00:00Z", "2026-01-05T00:00:00Z"),
  ];
  const active = rows.filter(({ archivedAt }) => !archivedAt).sort(compareBroadcastsNewestFirst);
  const archived = rows.filter(({ archivedAt }) => archivedAt).sort(compareBroadcastsNewestFirst);

  assert.deepEqual(active.map(({ id }) => id), [3, 1]);
  assert.deepEqual(archived.map(({ id }) => id), [2, 4]);
  assert.deepEqual(rows.map(({ id }) => id), [1, 2, 3, 4], "filtered sorting must leave cached rows intact");
});
