import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const eventAttachmentsTable = pgTable("event_attachments", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("event_attachments_event_id_idx").on(t.eventId),
]);

export const insertEventAttachmentSchema = createInsertSchema(eventAttachmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEventAttachment = z.infer<typeof insertEventAttachmentSchema>;
export type EventAttachment = typeof eventAttachmentsTable.$inferSelect;
