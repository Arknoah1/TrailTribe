import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";
import { usersTable } from "./users";

/** Immutable record of sensitive household corrections performed by an administrator. */
export const householdAdminAuditTable = pgTable("household_admin_audit", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "set null" }),
  memberId: integer("member_id").references(() => usersTable.id, { onDelete: "set null" }),
  administratorUserId: integer("administrator_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("household_admin_audit_household_id_idx").on(t.householdId),
  index("household_admin_audit_member_id_idx").on(t.memberId),
]);