import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  EventAudienceConflictError,
  normalizeEventAudience,
} from "@workspace/db/event-audience";

type EventRow = {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date | null;
  podIds: string[] | null;
  isAllTeam: boolean;
  isArchived: boolean;
  eventType: string;
};

const mocks = vi.hoisted(() => ({ events: [] as EventRow[] }));

vi.mock("drizzle-orm", () => {
  type Column = { name: keyof EventRow };
  type Predicate = (row: EventRow) => boolean;
  const value = (row: EventRow, column: Column | { completion: true }) =>
    "completion" in column ? row.endTime ?? row.startTime : row[column.name];

  return {
    eq: (column: Column, expected: unknown): Predicate => (row) => value(row, column) === expected,
    gte: (column: Column, expected: Date): Predicate => (row) => value(row, column) >= expected,
    lte: (column: Column | { completion: true }, expected: Date): Predicate =>
      (row) => value(row, column) <= expected,
    gt: (column: Column | { completion: true }, expected: Date): Predicate =>
      (row) => value(row, column) > expected,
    and: (...predicates: Array<Predicate | undefined>): Predicate =>
      (row) => predicates.every((predicate) => !predicate || predicate(row)),
    or: (...predicates: Array<Predicate | undefined>): Predicate =>
      (row) => predicates.some((predicate) => predicate?.(row)),
    arrayContains: (column: Column, expected: string[]): Predicate =>
      (row) => expected.every((item) => ((value(row, column) as string[] | null) ?? []).includes(item)),
    inArray: (column: Column, expected: unknown[]): Predicate =>
      (row) => expected.includes(value(row, column)),
    desc: (column: Column) => ({ column, direction: "desc" }),
    sql: () => ({ completion: true }),
  };
});

vi.mock("@workspace/db", () => {
  const table = () => new Proxy({}, {
    get: (_target, key) => typeof key === "string" ? { name: key } : undefined,
  });
  const eventsTable = table();
  const otherTable = table();

  function selectQuery() {
    let source: object;
    let predicate: ((row: EventRow) => boolean) | undefined;
    let ordering: Array<any> = [];
    let limit: number | undefined;
    let offset = 0;
    const query: any = {
      from: vi.fn((tableValue: object) => {
        source = tableValue;
        return query;
      }),
      where: vi.fn((condition: (row: EventRow) => boolean) => {
        predicate = condition;
        return query;
      }),
      orderBy: vi.fn((...order: Array<any>) => {
        ordering = order;
        return query;
      }),
      limit: vi.fn((value: number) => {
        limit = value;
        return query;
      }),
      offset: vi.fn((value: number) => {
        offset = value;
        return query;
      }),
      then: (resolve: (rows: EventRow[]) => unknown, reject: (error: unknown) => unknown) => {
        try {
          if (source !== eventsTable) return Promise.resolve(resolve([]));
          const rows = mocks.events
            .filter((row) => predicate?.(row) ?? true)
            .sort((left, right) => {
              for (const item of ordering) {
                const column = item.column ?? item;
                const direction = item.direction === "desc" ? -1 : 1;
                const leftValue = left[column.name as keyof EventRow] as Date | number;
                const rightValue = right[column.name as keyof EventRow] as Date | number;
                const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
                if (comparison !== 0) return comparison * direction;
              }
              return 0;
            })
            .slice(offset, limit === undefined ? undefined : offset + limit);
          return Promise.resolve(resolve(rows));
        } catch (error) {
          return Promise.resolve(reject(error));
        }
      },
    };
    return query;
  }

  return {
    db: {
      select: vi.fn(() => selectQuery()),
      query: {
        trailheadsTable: { findFirst: vi.fn(() => Promise.resolve(null)) },
        usersTable: { findFirst: vi.fn(() => Promise.resolve(null)) },
        eventsTable: { findFirst: vi.fn(() => Promise.resolve(null)) },
      },
    },
    eventsTable,
    eventRsvpsTable: otherTable,
    eventTasksTable: otherTable,
    eventTaskSignupsTable: otherTable,
    trailheadsTable: otherTable,
    eventAttachmentsTable: otherTable,
    usersTable: otherTable,
    carpoolOffersTable: otherTable,
    carpoolClaimsTable: otherTable,
    EventAudienceConflictError,
    normalizeEventAudience,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireApproved: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCoachOrAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./board", () => ({ createEventThread: vi.fn(() => Promise.resolve()) }));
vi.mock("../lib/rsvpEmailBatches", () => ({ queueRsvpConfirmationBatch: vi.fn() }));
vi.mock("../lib/rsvpEmailContent", () => ({ shouldQueueRsvpConfirmation: vi.fn() }));

const { default: eventsRouter } = await import("./events");
const app = express();
app.use(eventsRouter);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  mocks.events = [
    { id: 1, title: "Tied A", startTime: new Date("2020-01-02T10:00:00Z"), endTime: null, podIds: ["pod-a"], isAllTeam: false, isArchived: false, eventType: "practice" },
    { id: 2, title: "Tied B", startTime: new Date("2020-01-02T10:00:00Z"), endTime: new Date("2020-01-02T12:00:00Z"), podIds: ["pod-a"], isAllTeam: false, isArchived: false, eventType: "practice" },
    { id: 3, title: "Other pod", startTime: new Date("2020-01-03T10:00:00Z"), endTime: null, podIds: ["pod-b"], isAllTeam: false, isArchived: false, eventType: "practice" },
    { id: 4, title: "Older", startTime: new Date("2019-01-01T10:00:00Z"), endTime: null, podIds: ["pod-a"], isAllTeam: false, isArchived: false, eventType: "practice" },
    { id: 5, title: "Still running", startTime: new Date("2020-01-04T10:00:00Z"), endTime: new Date("2099-01-04T12:00:00Z"), podIds: ["pod-a"], isAllTeam: false, isArchived: false, eventType: "practice" },
  ];
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});

async function ids(path: string): Promise<number[]> {
  const response = await fetch(`${baseUrl}${path}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as EventRow[]).map((event) => event.id);
}

describe("GET /events completion pagination", () => {
  it("filters by end time when present and start time otherwise before paging", async () => {
    expect(await ids("/events?completionStatus=completed&podId=pod-a&limit=2")).toEqual([2, 1]);
    expect(await ids("/events?completionStatus=completed&podId=pod-a&limit=2&offset=2")).toEqual([4]);
    expect(await ids("/events?completionStatus=upcoming&podId=pod-a")).toEqual([5]);
  });

  it("uses event ID as a deterministic tie-breaker", async () => {
    expect(await ids("/events?completionStatus=completed&podId=pod-a&limit=1")).toEqual([2]);
    expect(await ids("/events?completionStatus=completed&podId=pod-a&limit=1&offset=1")).toEqual([1]);
  });
});