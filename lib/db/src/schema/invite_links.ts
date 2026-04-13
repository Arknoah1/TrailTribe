import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";
import { usersTable } from "./users";

export const inviteLinksTable = pgTable("invite_links", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  podId: text("pod_id"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInviteLinkSchema = createInsertSchema(inviteLinksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInviteLink = z.infer<typeof insertInviteLinkSchema>;
export type InviteLink = typeof inviteLinksTable.$inferSelect;
