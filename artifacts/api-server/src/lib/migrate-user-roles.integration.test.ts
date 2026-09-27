import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { pool } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { runMigrations } from "./migrate";
import { permanentlyDeleteLocalAccount } from "./account-deletion";

describe("user multi-role migration", () => {
  const emails: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await runMigrations();
  });

  afterAll(async () => {
    if (emails.length > 0) {
      await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]);
    }
  });

  async function insertUser(role: string, roles?: string[]) {
    const email = `multi-role-${process.pid}-${Date.now()}-${emails.length}@example.test`;
    emails.push(email);
    return pool.query(
      `INSERT INTO users (first_name, last_name, email, role${roles ? ", roles" : ""})
       VALUES ($1, $2, $3, $4${roles ? ", $5" : ""})
       RETURNING role, roles`,
      roles
        ? ["Multi", "Role", email, role, roles]
        : ["Multi", "Role", email, role],
    );
  }

  async function withTemporaryUsersTable<T>(
    callback: (testDb: ReturnType<typeof drizzle>) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    const testDb = drizzle(client);
    try {
      await client.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING ALL)");
      return await callback(testDb);
    } finally {
      await client.query("DROP TABLE IF EXISTS users");
      client.release();
    }
  }

  it("backfills legacy-style inserts with their primary role", async () => {
    const result = await insertUser("coach");
    expect(result.rows[0]).toEqual({ role: "coach", roles: ["coach"] });
  });

  it("stores combined responsibilities while retaining the primary role", async () => {
    const result = await insertUser("parent", ["parent", "coach", "super_admin"]);
    expect(result.rows[0]).toEqual({
      role: "parent",
      roles: ["parent", "coach", "super_admin"],
    });
  });

  it("keeps legacy primary-role updates synchronized", async () => {
    const inserted = await insertUser("parent", ["parent", "coach"]);
    const email = emails.at(-1)!;
    const result = await pool.query(
      "UPDATE users SET role = 'super_admin' WHERE email = $1 RETURNING role, roles",
      [email],
    );
    expect(inserted.rows[0].roles).toEqual(["parent", "coach"]);
    expect(result.rows[0]).toEqual({ role: "super_admin", roles: ["super_admin", "coach"] });
  });

  it("rejects mixing the student responsibility with adult capabilities", async () => {
    await expect(insertUser("student", ["student", "coach"])).rejects.toMatchObject({
      constraint: "users_roles_valid_check",
    });
  });

  it("keeps the publish-safe legacy empty-array fallback in the database constraint", async () => {
    const result = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'users'::regclass
         AND conname = 'users_roles_valid_check'`,
    );

    expect(result.rows[0]?.definition).toContain("cardinality(roles) = 0");
  });

  it("blocks deletion of the only super admin when roles is empty", async () => {
    await withTemporaryUsersTable(async (testDb) => {
      const [user] = await testDb
        .insert(usersTable)
        .values({
          firstName: "Empty",
          lastName: "Roles Admin",
          email: "empty-roles-admin@example.test",
          role: "super_admin",
          roles: [],
        })
        .returning();

      const result = await permanentlyDeleteLocalAccount(user, testDb);

      expect(result).toEqual({ ok: false, stage: "last_super_admin" });

      const remaining = await testDb
        .select({ id: usersTable.id, roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, user.id));
      expect(remaining).toEqual([{ id: user.id, roles: [] }]);
    });
  });

  it("includes a primary coach with empty roles in the live coach filter query", async () => {
    await withTemporaryUsersTable(async (testDb) => {
      const [user] = await testDb
        .insert(usersTable)
        .values({
          firstName: "Empty",
          lastName: "Roles Coach",
          email: "empty-roles-coach@example.test",
          role: "coach",
          roles: [],
        })
        .returning();

      const coaches = await testDb
        .select({ id: usersTable.id, role: usersTable.role, roles: usersTable.roles })
        .from(usersTable)
        .where(sql`${usersTable.role} = ${"coach"} OR ${"coach"} = ANY(${usersTable.roles})`);

      expect(coaches).toContainEqual({ id: user.id, role: "coach", roles: [] });
    });
  });
});