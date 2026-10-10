/**
 * Regression test for GET /users filter composition.
 *
 * The `role` filter matches either the legacy single `role` column or the
 * multi-role `roles` array, which needs an OR. If that OR is not parenthesised,
 * SQL's AND-over-OR precedence lets every legacy-role match bypass the `podId`
 * and `search` filters (e.g. ?role=coach&podId=pod-1 returned all coaches).
 *
 * This inspects the SQL the route hands to the query builder, so it needs no
 * database.
 *
 * Run via: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";

let capturedWhere: unknown = null;

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const mockDb = {
    query: {
      usersTable: { findFirst: vi.fn(async () => null) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          capturedWhere = condition;
          return Promise.resolve([]);
        }),
      })),
    })),
  };
  return {
    ...schema,
    db: mockDb,
    isOperationalStaffRole: (user: any) =>
      user?.role === "coach" || user?.role === "super_admin",
    isSuperAdminRole: (user: any) => user?.role === "super_admin",
  };
});

vi.mock("../middlewares/requireAuth", () => {
  const pass = (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_user";
    next();
  };
  return {
    requireAuth: pass,
    requireApproved: pass,
    requireCoachOrAdmin: pass,
    requireSuperAdmin: pass,
  };
});

vi.mock("@clerk/express", () => ({ createClerkClient: vi.fn(() => ({ users: {} })) }));
vi.mock("../lib/notifications", () => ({
  notifyCoachesOfNewFamily: vi.fn(),
  notifyCoachesOfReturningFamily: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/account-deletion", () => ({
  permanentlyDeleteLocalAccount: vi.fn(),
  deleteClerkUserId: vi.fn(),
}));

const { default: usersRouter } = await import("./users");

const app = express();
app.use(express.json());
app.use(usersRouter);

let server: Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer(app as any);
      server.listen(0, () => {
        baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  capturedWhere = null;
});

function whereSql(): string {
  return new PgDialect().sqlToQuery(capturedWhere as any).sql;
}

describe("GET /users filter composition", () => {
  it("keeps the role OR-match inside its own parentheses when combined with podId", async () => {
    const res = await fetch(`${baseUrl}/users?role=coach&podId=pod-1`);
    expect(res.status).toBe(200);
    expect(whereSql()).toContain(
      `("users"."role" = $1 OR $2 = ANY("users"."roles")) and "users"."pod_id" = $3`,
    );
  });

  it("keeps the role OR-match inside its own parentheses when combined with search", async () => {
    const res = await fetch(`${baseUrl}/users?role=student&search=ann`);
    expect(res.status).toBe(200);
    const sqlText = whereSql();
    expect(sqlText).toContain(`("users"."role" = $1 OR $2 = ANY("users"."roles")) and (`);
  });
});
