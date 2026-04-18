import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const podsTable = pgTable("pods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  headCoachId: integer("head_coach_id").references(() => usersTable.id, { onDelete: "set null" }),
  color: text("color"),
  season: text("season"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPodSchema = createInsertSchema(podsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPod = z.infer<typeof insertPodSchema>;
export type Pod = typeof podsTable.$inferSelect;
