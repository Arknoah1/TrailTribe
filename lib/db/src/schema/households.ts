import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  podId: text("pod_id"),
  address: text("address"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  liabilityWaiverSigned: boolean("liability_waiver_signed").notNull().default(false),
  liabilityWaiverSignedAt: timestamp("liability_waiver_signed_at", { withTimezone: true }),
  mediaReleaseSigned: boolean("media_release_signed").notNull().default(false),
  mediaReleaseSignedAt: timestamp("media_release_signed_at", { withTimezone: true }),
  codeOfConductSigned: boolean("code_of_conduct_signed").notNull().default(false),
  codeOfConductSignedAt: timestamp("code_of_conduct_signed_at", { withTimezone: true }),
  seasonEnrolled: boolean("season_enrolled").notNull().default(false),
  lastReminderSentAt: timestamp("last_reminder_sent_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHouseholdSchema = createInsertSchema(householdsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type Household = typeof householdsTable.$inferSelect;
