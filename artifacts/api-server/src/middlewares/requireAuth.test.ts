import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

let currentUser: Record<string, unknown> | null = null;
const update = vi.fn(() => ({
  set: vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: "clerk_test" })),
}));

vi.mock("@workspace/db", () => ({
  db: {
    query: {
      usersTable: {
        findFirst: vi.fn(() => Promise.resolve(currentUser)),
      },
    },
    update,
  },
  usersTable: new Proxy({}, { get: () => ({}) }),
  isOperationalStaffRole: (role: string | null | undefined) => role === "coach" || role === "super_admin",
  isSuperAdminRole: (role: string | null | undefined) => role === "super_admin",
}));

const { requireApproved, requireCoachOrAdmin, requireSuperAdmin } = await import("./requireAuth");

describe("requireApproved student access", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    currentUser = {
      id: 7,
      role: "student",
      householdId: 42,
      approved: false,
    };
    update.mockClear();

    const app = express();
    app.get("/calendar/subscribe-url", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/events", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/events/7", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/events/7/carpools", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/messages", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/board/threads", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/board/threads/7", requireApproved, (_req, res) => res.sendStatus(200));
    app.get("/staff", requireCoachOrAdmin, (_req, res) => res.sendStatus(200));
    app.get("/super-admin", requireSuperAdmin, (_req, res) => res.sendStatus(200));
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://localhost:${address.port}`;
  });

  it("allows linked students through all student-safe route guards and repairs approval", async () => {
    const paths = [
      "/calendar/subscribe-url",
      "/events",
      "/events/7",
      "/events/7/carpools",
      "/messages",
      "/board/threads",
      "/board/threads/7",
    ];

    for (const path of paths) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(200);
    }
    expect(update).toHaveBeenCalled();
  });

  it("allows an already-approved linked student without changing approval", async () => {
    currentUser = { id: 7, role: "student", householdId: 42, approved: true };
    const response = await fetch(`${baseUrl}/messages`);
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { role: "parent", householdId: 42 },
    { role: "coach", householdId: null },
  ])("keeps unapproved $role accounts blocked", async ({ role, householdId }) => {
    currentUser = { id: 8, role, householdId, approved: false };
    const response = await fetch(`${baseUrl}/events`);
    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("gives super admins normal staff access plus protected access", async () => {
    currentUser = { id: 1, role: "super_admin", householdId: null, approved: true };
    expect((await fetch(`${baseUrl}/staff`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/super-admin`)).status).toBe(200);
  });

  it("keeps coach access operational while blocking protected actions", async () => {
    currentUser = { id: 2, role: "coach", householdId: null, approved: true };
    expect((await fetch(`${baseUrl}/staff`)).status).toBe(200);
    const protectedResponse = await fetch(`${baseUrl}/super-admin`);
    expect(protectedResponse.status).toBe(403);
    expect(await protectedResponse.json()).toEqual({ error: "Forbidden: super admin role required" });
  });

  // Avoid leaking a listening socket between tests while retaining one app per test
  // so the mutable user fixture is isolated.
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});