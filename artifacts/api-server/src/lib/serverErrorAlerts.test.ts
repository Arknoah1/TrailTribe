import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  insertValues: vi.fn(),
  sendEmail: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    query: { usersTable: { findMany: mocks.findMany } },
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
  notificationsTable: {},
  usersTable: { role: "role", isActive: "is_active" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => args),
  eq: vi.fn((...args) => args),
}));
vi.mock("./email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("./logger", () => ({ logger: { error: mocks.loggerError } }));

import {
  fingerprintServerError,
  recordUnhandledServerError,
  resetServerErrorAlertsForTests,
} from "./serverErrorAlerts";

function request(id: string, url = "/api/events?authorization=secret"): Request {
  return {
    id,
    method: "GET",
    originalUrl: url,
  } as unknown as Request;
}

describe("server error alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServerErrorAlertsForTests();
    mocks.findMany.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue({ status: "sent" });
  });

  it("groups matching failures under a stable fingerprint without query data", () => {
    const error = new Error("database password=secret");
    const first = fingerprintServerError(error, request("one"));
    const second = fingerprintServerError(error, request("two", "/api/events?token=other"));

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain("secret");
  });

  it("alerts on the third matching 5xx and rate-limits the incident", async () => {
    const error = new Error("database password=secret");
    const base = 1_000_000;

    recordUnhandledServerError(error, request("req-1"), base);
    recordUnhandledServerError(error, request("req-2"), base + 1);
    recordUnhandledServerError(error, request("req-3"), base + 2);
    recordUnhandledServerError(error, request("req-4"), base + 3);
    await vi.waitFor(() => expect(mocks.findMany).toHaveBeenCalledTimes(1));

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "GET /api/events",
        requestIds: ["req-1", "req-2", "req-3"],
        occurrences: 3,
      }),
      "Repeated unhandled server error",
    );
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain("password=secret");
  });

  it("allows another alert after the cooldown", async () => {
    const error = new Error("repeat");
    const base = 1_000_000;

    for (let i = 0; i < 3; i++) {
      recordUnhandledServerError(error, request(`first-${i}`), base + i);
    }
    for (let i = 0; i < 3; i++) {
      recordUnhandledServerError(error, request(`second-${i}`), base + 3_600_001 + i);
    }

    await vi.waitFor(() => expect(mocks.findMany).toHaveBeenCalledTimes(2));
  });
});