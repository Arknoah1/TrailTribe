import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { documentTypeEnum } from "./team_documents";

export const documentConsentsTable = pgTable("document_consents", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  /** objectPath or externalUrl of the document at the moment of signing */
  documentVersion: text("document_version").notNull(),
  /** Verbatim acceptance text the user agreed to */
  acceptanceText: text("acceptance_text").notNull(),
  /** Active season ID at time of signing; null when no season is active */
  seasonId: integer("season_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentConsent = typeof documentConsentsTable.$inferSelect;
