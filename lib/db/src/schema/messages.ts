import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const messageChannelEnum = ["email", "sms", "push"] as const;
export type MessageChannel = (typeof messageChannelEnum)[number];

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  senderUserId: integer("sender_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  subject: text("subject"),
  body: text("body").notNull(),
  channel: text("channel", { enum: messageChannelEnum }).notNull().default("email"),
  targetPodIds: text("target_pod_ids").array(),
  isAllTeam: boolean("is_all_team").notNull().default(false),
  recipientCount: integer("recipient_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcastsTable.$inferSelect;
