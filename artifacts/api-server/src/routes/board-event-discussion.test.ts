import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const COACH = {
  id: 1,
  clerkUserId: "clerk_test_coach",
  role: "coach",
  podId: null,
  firstName: "Coach",
  lastName: "Trail",
  avatarUrl: null,
};

type EventFixture = {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date;
  podIds: string[];
};

type ThreadFixture = {
  id: number;
  title: string;
  body: string;
  authorUserId: number;
  eventId: number;
  podId: null;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  lastReplyAt: Date | null;
  createdAt: Date;
};

const events: EventFixture[] = [];
const threads: ThreadFixture[] = [];
let selectCallIndex = 0;

function chain<T>(result: T) {
  const query: any = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockResolvedValue(result);
  return query;
}

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {
      select: vi.fn(() => {
        // The event board query is the only select in these requests.
        selectCallIndex += 1;
        return chain(threads);
      }),
      query: {
        usersTable: {
          findFirst: vi.fn().mockImplementation(() => Promise.resolve(COACH)),
        },
        eventsTable: {
          findMany: vi.fn().mockImplementation(() => Promise.resolve(events)),
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            // The route's equality expressions are opaque in this mock; there is
            // only one event in direct-lookup enrichment at a time in practice.
            return Promise.resolve(events.find((event) => event.id === where?.right) ?? events[0] ?? null);
          }),
        },
      },
    },
    boardThreadsTable: table,
    boardPostsTable: table,
    usersTable: table,
    eventsTable: table,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
}));

vi.mock("../lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { default: boardRouter } = await import("./board");

const app = express();
app.use(boardRouter);
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  vi.setSystemTime(NOW);
  events.length = 0;
  threads.length = 0;
  selectCallIndex = 0;
});

function addEvent(id: number, startTime: Date, endTime: Date) {
  const event = { id, title: `Event ${id}`, startTime, endTime, podIds: [] };
  events.push(event);
  return event;
}

function addThread(id: number, eventId: number, activity: Date) {
  threads.push({
    id,
    title: `Thread ${id}`,
    body: "Discussion",
    authorUserId: COACH.id,
    eventId,
    podId: null,
    isPinned: false,
    isLocked: false,
    replyCount: 0,
    lastReplyAt: activity,
    createdAt: new Date(activity.getTime() - 60_000),
  });
}

async function getThreads(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

describe("event discussion board visibility and ordering", () => {
  it("includes upcoming, active, and recently ended events, but expires after 36 hours", async () => {
    addEvent(1, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    addEvent(2, new Date("2026-08-20T10:00:00Z"), new Date("2026-08-20T11:00:00Z"));
    addEvent(3, new Date("2026-08-19T00:00:00Z"), new Date("2026-08-19T00:00:00Z")); // 35 hours ago
    addEvent(4, new Date("2026-08-18T23:59:59Z"), new Date("2026-08-18T23:59:59Z")); // 36h + 1ms ago
    addThread(1, 1, new Date("2026-08-20T09:00:00Z"));
    addThread(2, 2, new Date("2026-08-20T09:30:00Z"));
    addThread(3, 3, new Date("2026-08-20T09:45:00Z"));
    addThread(4, 4, new Date("2026-08-20T09:50:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.status).toBe(200);
    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([3, 2, 1]);
  });

  it("keeps a thread visible at exactly 36 hours after event end", async () => {
    addEvent(10, new Date("2026-08-18T00:00:00Z"), new Date("2026-08-19T00:00:00Z"));
    addThread(10, 10, new Date("2026-08-19T01:00:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([10]);
  });

  it("uses most recent activity when events share a start time", async () => {
    const start = new Date("2026-08-21T12:00:00Z");
    addEvent(20, start, new Date("2026-08-21T13:00:00Z"));
    addEvent(21, start, new Date("2026-08-21T14:00:00Z"));
    addThread(20, 20, new Date("2026-08-20T08:00:00Z"));
    addThread(21, 21, new Date("2026-08-20T10:00:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([21, 20]);
  });

  it("returns an expired discussion for a direct event lookup", async () => {
    addEvent(30, new Date("2026-08-17T00:00:00Z"), new Date("2026-08-18T00:00:00Z"));
    addThread(30, 30, new Date("2026-08-18T01:00:00Z"));

    const board = await getThreads("/board/threads?scope=event");
    const detail = await getThreads("/board/threads?scope=event&eventId=30");

    expect(board.body).toEqual([]);
    expect(detail.body.map((thread: ThreadFixture) => thread.id)).toEqual([30]);
  });
});