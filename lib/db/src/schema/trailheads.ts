import { pgTable, text, serial, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trailheadsTable = pgTable("trailheads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  googleMapsUrl: text("google_maps_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTrailheadSchema = createInsertSchema(trailheadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrailhead = z.infer<typeof insertTrailheadSchema>;
export type Trailhead = typeof trailheadsTable.$inferSelect;
