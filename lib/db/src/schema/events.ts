import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trailheadsTable } from "./trailheads";
import { usersTable } from "./users";
import { volunteerTemplateCategoriesTable } from "./volunteer";

export const eventTypeEnum = ["practice", "race", "social", "volunteer", "other"] as const;
export type EventType = (typeof eventTypeEnum)[number];

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  eventType: text("event_type", { enum: eventTypeEnum }).notNull().default("practice"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  trailheadId: integer("trailhead_id").references(() => trailheadsTable.id, { onDelete: "set null" }),
  locationOverride: text("location_override"),
  googleMapsUrlOverride: text("google_maps_url_override"),
  podIds: text("pod_ids").array(),
  isAllTeam: boolean("is_all_team").notNull().default(false),
  rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
  volunteerSlotsNeeded: integer("volunteer_slots_needed").notNull().default(0),
  volunteerTasksEnabled: boolean("volunteer_tasks_enabled").notNull().default(false),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  iCalUid: text("ical_uid").notNull().unique(),
  isArchived: boolean("is_archived").notNull().default(false),
  seriesId: text("series_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const eventRsvpsTable = pgTable("event_rsvps", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["attending", "not_attending", "maybe"] }).notNull().default("maybe"),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("event_rsvps_event_id_idx").on(t.eventId),
  index("event_rsvps_user_id_idx").on(t.userId),
]);

export const insertEventRsvpSchema = createInsertSchema(eventRsvpsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEventRsvp = z.infer<typeof insertEventRsvpSchema>;
export type EventRsvp = typeof eventRsvpsTable.$inferSelect;

// ─── VOLUNTEER TASK SYSTEM ──────────────────────────────────────────────────

export const volunteerTemplateTasksTable = pgTable("volunteer_template_tasks", {
  id: serial("id").primaryKey(),
  // Transitional dual-column migration: categoryId becomes required only after
  // production has been backfilled and the legacy category column is removed.
  categoryId: integer("category_id").references(() => volunteerTemplateCategoriesTable.id, { onDelete: "restrict" }),
  category: text("category"),
  title: text("title").notNull(),
  description: text("description"),
  slotsDefault: integer("slots_default").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVolunteerTemplateTaskSchema = createInsertSchema(volunteerTemplateTasksTable).omit({
  id: true,
  createdAt: true,
});

export type InsertVolunteerTemplateTask = z.infer<typeof insertVolunteerTemplateTaskSchema>;
export type VolunteerTemplateTask = typeof volunteerTemplateTasksTable.$inferSelect;

export const eventTasksTable = pgTable("event_tasks", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  templateTaskId: integer("template_task_id").references(() => volunteerTemplateTasksTable.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  slotsNeeded: integer("slots_needed").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("event_tasks_event_id_idx").on(t.eventId),
]);

export const insertEventTaskSchema = createInsertSchema(eventTasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEventTask = z.infer<typeof insertEventTaskSchema>;
export type EventTask = typeof eventTasksTable.$inferSelect;

export const eventTaskSignupsTable = pgTable("event_task_signups", {
  id: serial("id").primaryKey(),
  eventTaskId: integer("event_task_id").notNull().references(() => eventTasksTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("event_task_signups_task_user_unique").on(t.eventTaskId, t.userId),
  index("event_task_signups_event_id_idx").on(t.eventId),
  index("event_task_signups_user_id_idx").on(t.userId),
]);

export const insertEventTaskSignupSchema = createInsertSchema(eventTaskSignupsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertEventTaskSignup = z.infer<typeof insertEventTaskSignupSchema>;
export type EventTaskSignup = typeof eventTaskSignupsTable.$inferSelect;

// ─── VOLUNTEER TASK PACKS ──────────────────────────────────────────────────

export const volunteerTaskPacksTable = pgTable("volunteer_task_packs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const volunteerTaskPackTasksTable = pgTable("volunteer_task_pack_tasks", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull().references(() => volunteerTaskPacksTable.id, { onDelete: "cascade" }),
  templateTaskId: integer("template_task_id").notNull().references(() => volunteerTemplateTasksTable.id, { onDelete: "cascade" }),
}, (t) => [
  uniqueIndex("vt_pack_tasks_unique").on(t.packId, t.templateTaskId),
]);

export type VolunteerTaskPack = typeof volunteerTaskPacksTable.$inferSelect;
export type VolunteerTaskPackTask = typeof volunteerTaskPackTasksTable.$inferSelect;
