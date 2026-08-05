import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Single-row settings table for team-wide configuration.
 * Row with id=1 is always the canonical settings record.
 */
export const teamSettingsTable = pgTable("team_settings", {
  id: serial("id").primaryKey(),
  teamName: text("team_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TeamSettings = typeof teamSettingsTable.$inferSelect;
export type InsertTeamSettings = typeof teamSettingsTable.$inferInsert;
