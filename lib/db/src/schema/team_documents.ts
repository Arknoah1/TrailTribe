import { pgTable, text, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentTypeEnum = pgEnum("document_type", [
  "liability_waiver",
  "media_release",
  "code_of_conduct",
]);

export const teamDocumentsTable = pgTable("team_documents", {
  id: serial("id").primaryKey(),
  type: documentTypeEnum("type").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  objectPath: text("object_path"),
  externalUrl: text("external_url"),
  mimeType: text("mime_type"),
  originalName: text("original_name"),
  /** Incremented by the server on every objectPath/externalUrl replacement — provides an immutable version identifier that survives in-place content changes */
  versionNumber: integer("version_number").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeamDocumentSchema = createInsertSchema(teamDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeamDocument = z.infer<typeof insertTeamDocumentSchema>;
export type TeamDocument = typeof teamDocumentsTable.$inferSelect;
