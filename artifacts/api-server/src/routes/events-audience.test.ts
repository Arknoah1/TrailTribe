import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  EventAudienceConflictError,
  normalizeEventAudience,
} from "@workspace/db/event-audience";

const coach = { id: 1, clerkUserId: "coach", role: "coach" };
const existingEvent = {
  id: 42,
  title: "Existing ride",
  startTime: new Date("2026-09-10T17:00:00.000Z"),
  endTime: null,
  podIds: ["pod-a"],
  isAllTeam: false,
};
const writes: Array<{ kind: string; values: any }> = [];
const notifyEventChanged = vi.fn(() => Promise.resolve());

function returningWrite(kind: string) {
  const query: any = {
    values: vi.fn((values: any) => {
      writes.push({ kind, values });
      return query;
    }),
    set: vi.fn((values: any) => {
      writes.push({ kind, values });
      return query;
    }),
    where: vi.fn(() => query),
    returning: vi.fn(() => {
      const latest = writes.at(-1)?.values;
      const value = Array.isArray(latest) ? latest : [latest];
      return Promise.resolve(value.map((row, index) => ({
        ...existingEvent,
        ...row,
        id: row.id ?? existingEvent.id + index,
      })));
    }),
  };
  return query;
}

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: (_target, key) => ({ name: String(key) }) });
  const selectQuery: any = {
    from: vi.fn(() => selectQuery),
    where: vi.fn(() => Promise.resolve([])),
  };
  const db = {
    query: {
      usersTable: { findFirst: vi.fn(() => Promise.resolve(coach)) },
      eventsTable: { findFirst: vi.fn(() => Promise.resolve(existingEvent)) },
      trailheadsTable: { findFirst: vi.fn(() => Promise.resolve(null)) },
    },
    insert: vi.fn(() => returningWrite("insert")),
    update: vi.fn(() => returningWrite("update")),
    select: vi.fn(() => selectQuery),
    transaction: vi.fn(async (callback: (tx: any) => unknown) =>
      callback({ insert: vi.fn(() => returningWrite("batch")) })),
  };
  return {
    db,
    eventsTable: table,
    eventRsvpsTable: table,
    eventTasksTable: table,
    eventTaskSignupsTable: table,
    trailheadsTable: table,
    eventAttachmentsTable: table,
    usersTable: table,
    carpoolOffersTable: table,
    carpoolClaimsTable: table,
    EventAudienceConflictError,
    normalizeEventAudience,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireApproved: (_req: any, _res: any, next: () => void) => next(),
  requireCoachOrAdmin: (req: any, _res: any, next: () => void) => {
    req.clerkUserId = coach.clerkUserId;
    next();
  },
}));
vi.mock("./board", () => ({ createEventThread: vi.fn(() => Promise.resolve()) }));
vi.mock("../lib/rsvpEmailBatches", () => ({ queueRsvpConfirmationBatch: vi.fn() }));
vi.mock("../lib/rsvpEmailContent", () => ({ shouldQueueRsvpConfirmation: vi.fn() }));
vi.mock("../lib/eventChangeNotifications", () => ({
  notifyEventChanged,
  notifySeriesRescheduled: vi.fn(() => Promise.resolve()),
}));

const { default: eventsRouter } = await import("./events");
const app = express();
app.use(express.json());
app.use(eventsRouter);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  writes.length = 0;
  notifyEventChanged.mockClear();
});

async function request(path: string, method: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const eventInput = {
  title: "Ride",
  startTime: "2026-09-10T17:00:00.000Z",
};

describe("event audience writes", () => {
  it("creates a valid team-wide event with no pod list", async () => {
    const response = await request("/events", "POST", {
      ...eventInput,
      isAllTeam: true,
      podIds: [],
    });

    expect(response.status).toBe(201);
    expect(writes[0].values).toMatchObject({ isAllTeam: true, podIds: null });
  });

  it("creates a valid pod event and deduplicates its pod list", async () => {
    const response = await request("/events", "POST", {
      ...eventInput,
      isAllTeam: false,
      podIds: ["pod-a", "pod-a", "pod-b"],
    });

    expect(response.status).toBe(201);
    expect(writes[0].values).toMatchObject({
      isAllTeam: false,
      podIds: ["pod-a", "pod-b"],
    });
  });

  it("rejects conflicting create input before writing", async () => {
    const response = await request("/events", "POST", {
      ...eventInput,
      isAllTeam: true,
      podIds: ["pod-a"],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Team-wide events cannot also target specific pods",
    });
    expect(writes).toHaveLength(0);
  });

  it("rejects a batch when any event has conflicting input", async () => {
    const response = await request("/events/batch", "POST", {
      events: [
        { ...eventInput, isAllTeam: false, podIds: ["pod-a"] },
        { ...eventInput, isAllTeam: true, podIds: ["pod-b"] },
      ],
    });

    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("changes a pod event to team-wide when the client omits podIds", async () => {
    const response = await request("/events/42", "PATCH", {
      isAllTeam: true,
    });

    expect(response.status).toBe(200);
    expect(writes[0].values).toMatchObject({ isAllTeam: true, podIds: null });
  });

  it("rejects an update that explicitly sends both audience settings", async () => {
    const response = await request("/events/42", "PATCH", {
      isAllTeam: true,
      podIds: ["pod-a"],
    });

    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("notifies by default when older clients omit the notification choice", async () => {
    const response = await request("/events/42", "PATCH", { title: "Updated ride" });
    expect(response.status).toBe(200);
    expect(notifyEventChanged).toHaveBeenCalledOnce();
  });

  it("supports an explicit silent save", async () => {
    const response = await request("/events/42", "PATCH", {
      title: "Updated ride",
      notifyFamilies: false,
    });
    expect(response.status).toBe(200);
    expect(notifyEventChanged).not.toHaveBeenCalled();
  });
});