import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const familyInvitesTable = pgTable("family_invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedByUserId: integer("invited_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FamilyInvite = typeof familyInvitesTable.$inferSelect;
