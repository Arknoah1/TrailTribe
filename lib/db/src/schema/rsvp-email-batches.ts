import { pgTable, text, serial, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";
import { usersTable } from "./users";

export const rsvpEmailBatchStatus = ["pending", "processing", "sent", "skipped", "failed"] as const;
export type RsvpEmailBatchStatus = (typeof rsvpEmailBatchStatus)[number];

export const rsvpEmailBatchesTable = pgTable("event_rsvp_email_batches", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  recipientUserId: integer("recipient_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: rsvpEmailBatchStatus }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("event_rsvp_email_batches_event_recipient_unique").on(t.eventId, t.recipientUserId),
  index("event_rsvp_email_batches_due_idx").on(t.status, t.dueAt),
]);

export const insertRsvpEmailBatchSchema = createInsertSchema(rsvpEmailBatchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRsvpEmailBatch = z.infer<typeof insertRsvpEmailBatchSchema>;
export type RsvpEmailBatch = typeof rsvpEmailBatchesTable.$inferSelect;