import { pgTable, text, serial, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteerTemplateCategoriesTable = pgTable("volunteer_template_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("volunteer_template_categories_name_key_unique").on(t.nameKey),
  index("volunteer_template_categories_sort_order_idx").on(t.sortOrder),
]);

export const insertVolunteerTemplateCategorySchema = createInsertSchema(volunteerTemplateCategoriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertVolunteerTemplateCategory = z.infer<typeof insertVolunteerTemplateCategorySchema>;
export type VolunteerTemplateCategory = typeof volunteerTemplateCategoriesTable.$inferSelect;