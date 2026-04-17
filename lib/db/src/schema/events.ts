import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trailheadsTable } from "./trailheads";
import { usersTable } from "./users";

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
});

export const insertEventRsvpSchema = createInsertSchema(eventRsvpsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEventRsvp = z.infer<typeof insertEventRsvpSchema>;
export type EventRsvp = typeof eventRsvpsTable.$inferSelect;

export const volunteerSignupsTable = pgTable("volunteer_signups", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVolunteerSignupSchema = createInsertSchema(volunteerSignupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVolunteerSignup = z.infer<typeof insertVolunteerSignupSchema>;
export type VolunteerSignup = typeof volunteerSignupsTable.$inferSelect;
