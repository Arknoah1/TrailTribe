import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const userRoleEnum = ["admin", "coach", "parent", "student"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const coachCertLevelEnum = ["1", "2", "3"] as const;
export type CoachCertLevel = (typeof coachCertLevelEnum)[number];

export const genderEnum = ["male", "female", "non_binary", "prefer_not_to_say"] as const;
export type Gender = (typeof genderEnum)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role", { enum: userRoleEnum }).notNull().default("parent"),
  podId: text("pod_id"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  clerkUserId: text("clerk_user_id").unique(),
  gender: text("gender", { enum: genderEnum }),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  grade: integer("grade"),
  coachCertLevel: text("coach_cert_level", { enum: coachCertLevelEnum }),
  allergies: text("allergies"),
  medications: text("medications"),
  medicalNotes: text("medical_notes"),
  approved: boolean("approved").notNull().default(false),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  smsNotifications: boolean("sms_notifications").notNull().default(false),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  notificationPreferences: jsonb("notification_preferences").$type<{
    practiceReminders: boolean;
    coachMessages: boolean;
    carpoolUpdates: boolean;
    eventReminders: boolean;
    rosterUpdates: boolean;
  }>().default(sql`'{"practiceReminders":true,"coachMessages":true,"carpoolUpdates":true,"eventReminders":true,"rosterUpdates":true}'::jsonb`).$defaultFn(() => ({
    practiceReminders: true,
    coachMessages: true,
    carpoolUpdates: true,
    eventReminders: true,
    rosterUpdates: true,
  })),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
