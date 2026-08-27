import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkDeleteCalls: string[] = [];
const transactionDeleteCalls: string[] = [];
const transactionUpdateCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const callOrder: string[] = [];
let householdMembers: Array<{ id: number }> = [];
let clerkDeleteFailure: unknown = null;
let transactionFailure: unknown = null;

function table(name: string) {
  return new Proxy(
    { __table: name },
    { get: (target, key) => target[key as keyof typeof target] ?? { table: name, column: String(key) } },
  );
}

const usersTable = table("usersTable");
const householdsTable = table("householdsTable");
const documentConsentsTable = table("documentConsentsTable");
const familyInvitesTable = table("familyInvitesTable");
const seasonRosterSnapshotsTable = table("seasonRosterSnapshotsTable");

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@clerk/express", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      deleteUser: vi.fn(async (clerkUserId: string) => {
        callOrder.push("clerk");
        clerkDeleteCalls.push(clerkUserId);
        if (clerkDeleteFailure) throw clerkDeleteFailure;
      }),
    },
  })),
}));

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
      callOrder.push("transaction");
      if (transactionFailure) throw transactionFailure;
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(async () => householdMembers),
          })),
        })),
        update: vi.fn((targetTable: { __table: string }) => ({
          set: vi.fn((values: Record<string, unknown>) => {
            transactionUpdateCalls.push({ table: targetTable.__table, values });
            return { where: vi.fn(async () => undefined) };
          }),
        })),
        delete: vi.fn((targetTable: { __table: string }) => {
          transactionDeleteCalls.push(targetTable.__table);
          return { where: vi.fn(async () => undefined) };
        }),
      };
      return callback(tx);
    }),
  },
  usersTable,
  householdsTable,
  documentConsentsTable,
  familyInvitesTable,
  seasonRosterSnapshotsTable,
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const { deleteClerkUserId, permanentlyDeleteLocalAccount } = await import("./account-deletion");

const member = {
  id: 12,
  clerkUserId: "clerk_member",
  email: "member@example.com",
  role: "parent",
  householdId: 42,
} as any;

beforeEach(() => {
  clerkDeleteCalls.length = 0;
  transactionDeleteCalls.length = 0;
  transactionUpdateCalls.length = 0;
  callOrder.length = 0;
  householdMembers = [{ id: member.id }];
  clerkDeleteFailure = null;
  transactionFailure = null;
  vi.clearAllMocks();
});

describe("permanentlyDeleteLocalAccount", () => {
  it("deletes the Clerk identity before atomically removing a sole member and empty household", async () => {
    const result = await permanentlyDeleteLocalAccount(member);

    expect(result).toEqual({ ok: true, deletedHousehold: true });
    expect(clerkDeleteCalls).toEqual(["clerk_member"]);
    expect(callOrder).toEqual(["clerk", "transaction"]);
    expect(transactionUpdateCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "documentConsentsTable", values: expect.objectContaining({ ipAddress: null, userAgent: null }) }),
      expect.objectContaining({ table: "familyInvitesTable", values: { acceptedByClerkUserId: null } }),
    ]));
    expect(transactionDeleteCalls).toEqual([
      "usersTable",
      "documentConsentsTable",
      "seasonRosterSnapshotsTable",
      "householdsTable",
    ]);
  });

  it("keeps a shared household and all other members intact", async () => {
    householdMembers = [{ id: member.id }, { id: 13 }];

    const result = await permanentlyDeleteLocalAccount(member);

    expect(result).toEqual({ ok: true, deletedHousehold: false });
    expect(transactionDeleteCalls).toEqual(["usersTable"]);
  });

  it("does not start a database deletion when Clerk is unavailable", async () => {
    clerkDeleteFailure = new Error("network unavailable");

    const result = await permanentlyDeleteLocalAccount(member);

    expect(result).toEqual({ ok: false, stage: "clerk" });
    expect(callOrder).toEqual(["clerk"]);
    expect(transactionDeleteCalls).toEqual([]);
  });

  it("reports a recoverable database failure after Clerk deletion", async () => {
    transactionFailure = new Error("database unavailable");

    const result = await permanentlyDeleteLocalAccount(member);

    expect(result).toEqual({ ok: false, stage: "database" });
    expect(callOrder).toEqual(["clerk", "transaction"]);
    expect(clerkDeleteCalls).toEqual(["clerk_member"]);
  });

  it("treats an already-missing Clerk identity as a successful retry", async () => {
    clerkDeleteFailure = { status: 404, message: "User not found" };

    await expect(deleteClerkUserId("clerk_member")).resolves.toBe(true);
  });
});