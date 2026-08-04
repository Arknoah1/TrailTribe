import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const seasonStatusEnum = ["active", "closed"] as const;
export type SeasonStatus = (typeof seasonStatusEnum)[number];

export const seasonsTable = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: seasonStatusEnum }).notNull().default("active"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Season = typeof seasonsTable.$inferSelect;
export type InsertSeason = typeof seasonsTable.$inferInsert;

/** One row per household per season, written at close time. Immutable after insert. */
export type SnapshotMember = {
  firstName: string;
  lastName: string;
  role: string;
  approved: boolean;
};

export const seasonRosterSnapshotsTable = pgTable("season_roster_snapshots", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => seasonsTable.id),
  householdId: integer("household_id").notNull(),
  familyName: text("family_name").notNull(),
  podName: text("pod_name"),
  enrolled: boolean("enrolled").notNull().default(false),
  liabilityWaiverSigned: boolean("liability_waiver_signed").notNull().default(false),
  mediaReleaseSigned: boolean("media_release_signed").notNull().default(false),
  codeOfConductSigned: boolean("code_of_conduct_signed").notNull().default(false),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  members: jsonb("members")
    .$type<SnapshotMember[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SeasonRosterSnapshot = typeof seasonRosterSnapshotsTable.$inferSelect;
