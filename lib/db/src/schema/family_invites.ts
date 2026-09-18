import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { householdsTable } from "./households";

export const familyInvitesTable = pgTable("family_invites", {
  id: serial("id").primaryKey(),
  email: text("email"),
  token: text("token").notNull().unique(),
  invitedByUserId: integer("invited_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByClerkUserId: text("accepted_by_clerk_user_id"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastEmailAttemptAt: timestamp("last_email_attempt_at", { withTimezone: true }),
  lastEmailSentAt: timestamp("last_email_sent_at", { withTimezone: true }),
  lastEmailStatus: text("last_email_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("family_invites_one_unresolved_household_email_idx")
    .on(table.householdId, sql`lower(${table.email})`)
    .where(sql`${table.householdId} IS NOT NULL AND ${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
]);

export type FamilyInvite = typeof familyInvitesTable.$inferSelect;
