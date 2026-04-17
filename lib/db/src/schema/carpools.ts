import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";
import { usersTable } from "./users";

export const carpoolRequestStatusEnum = ["open", "matched", "cancelled"] as const;
export type CarpoolRequestStatus = (typeof carpoolRequestStatusEnum)[number];

export const carpoolOffersTable = pgTable("carpool_offers", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  driverUserId: integer("driver_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  availableSeats: integer("available_seats").notNull().default(0),
  bikeTrayCount: integer("bike_tray_count").notNull().default(0),
  departureLocation: text("departure_location"),
  departureTime: timestamp("departure_time", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCarpoolOfferSchema = createInsertSchema(carpoolOffersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarpoolOffer = z.infer<typeof insertCarpoolOfferSchema>;
export type CarpoolOffer = typeof carpoolOffersTable.$inferSelect;

export const carpoolClaimsTable = pgTable("carpool_claims", {
  id: serial("id").primaryKey(),
  carpoolOfferId: integer("carpool_offer_id").notNull().references(() => carpoolOffersTable.id, { onDelete: "cascade" }),
  riderUserId: integer("rider_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  needsSeat: boolean("needs_seat").notNull().default(true),
  needsBikeTray: boolean("needs_bike_tray").notNull().default(false),
  notes: text("notes"),
  /**
   * True when the driver manually matched this rider via the "I'll Take Them" flow.
   * Driver-matched claims are tracked for trip logistics but do NOT consume the
   * offer's advertised seat/tray capacity in the UI — the driver made room for
   * this rider outside of the self-serve claim flow.
   */
  matchedByDriver: boolean("matched_by_driver").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCarpoolClaimSchema = createInsertSchema(carpoolClaimsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarpoolClaim = z.infer<typeof insertCarpoolClaimSchema>;
export type CarpoolClaim = typeof carpoolClaimsTable.$inferSelect;

export const carpoolRequestsTable = pgTable("carpool_requests", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  riderUserId: integer("rider_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  requestedByUserId: integer("requested_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  needsBikeTray: boolean("needs_bike_tray").notNull().default(false),
  notes: text("notes"),
  status: text("status", { enum: carpoolRequestStatusEnum }).notNull().default("open"),
  matchedOfferId: integer("matched_offer_id").references(() => carpoolOffersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("carpool_requests_active_unique_idx")
    .on(table.eventId, table.riderUserId)
    .where(sql`${table.status} IN ('open', 'matched')`),
]);

export const insertCarpoolRequestSchema = createInsertSchema(carpoolRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarpoolRequest = z.infer<typeof insertCarpoolRequestSchema>;
export type CarpoolRequest = typeof carpoolRequestsTable.$inferSelect;
