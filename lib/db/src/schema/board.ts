import { pgTable, text, serial, timestamp, integer, boolean, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { eventsTable } from "./events";

export const boardThreadsTable = pgTable("board_threads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  bodyFormat: text("body_format", { enum: ["plain", "markdown"] }).notNull().default("plain"),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  podId: text("pod_id"),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }),
  isPinned: boolean("is_pinned").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("board_threads_event_id_idx").on(t.eventId),
  index("board_threads_pod_id_idx").on(t.podId),
]);

export const insertBoardThreadSchema = createInsertSchema(boardThreadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBoardThread = z.infer<typeof insertBoardThreadSchema>;
export type BoardThread = typeof boardThreadsTable.$inferSelect;

export const boardThreadReportsTable = pgTable("board_thread_reports", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => boardThreadsTable.id, { onDelete: "set null" }),
  postId: integer("post_id").references(() => boardPostsTable.id, { onDelete: "set null" }),
  targetType: text("target_type", { enum: ["thread", "reply"] }).notNull().default("thread"),
  threadTitle: text("thread_title").notNull(),
  reporterUserId: integer("reporter_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reporterName: text("reporter_name").notNull(),
  reason: text("reason", { enum: ["inappropriate_content", "harassment", "spam", "other"] }).notNull(),
  details: text("details"),
  contentExcerpt: text("content_excerpt"),
  isAutomatic: boolean("is_automatic").notNull().default(false),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  resolutionNote: text("resolution_note"),
  resolvedByUserId: integer("resolved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("board_thread_reports_thread_id_idx").on(t.threadId),
  index("board_thread_reports_post_id_idx").on(t.postId),
  index("board_thread_reports_created_at_idx").on(t.createdAt),
  index("board_thread_reports_status_created_at_idx").on(t.status, t.createdAt),
]);

export type BoardThreadReport = typeof boardThreadReportsTable.$inferSelect;

export const boardHiddenMembersTable = pgTable("board_hidden_members", {
  id: serial("id").primaryKey(),
  hiderUserId: integer("hider_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  hiddenUserId: integer("hidden_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("board_hidden_members_hider_hidden_unique").on(t.hiderUserId, t.hiddenUserId),
  index("board_hidden_members_hidden_user_id_idx").on(t.hiddenUserId),
]);

export type BoardHiddenMember = typeof boardHiddenMembersTable.$inferSelect;

export const boardPostsTable = pgTable("board_posts", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => boardThreadsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  bodyFormat: text("body_format", { enum: ["plain", "markdown"] }).notNull().default("plain"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("board_posts_thread_id_idx").on(t.threadId),
]);

export const insertBoardPostSchema = createInsertSchema(boardPostsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBoardPost = z.infer<typeof insertBoardPostSchema>;
export type BoardPost = typeof boardPostsTable.$inferSelect;

export const boardAttachmentsTable = pgTable("board_attachments", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  threadId: integer("thread_id").references(() => boardThreadsTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").references(() => boardPostsTable.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  generation: text("generation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("board_attachments_target_check", sql`(${t.threadId} IS NOT NULL) <> (${t.postId} IS NOT NULL)`),
  index("board_attachments_thread_id_idx").on(t.threadId),
  index("board_attachments_post_id_idx").on(t.postId),
]);

export type BoardAttachment = typeof boardAttachmentsTable.$inferSelect;

export const boardReactionsTable = pgTable("board_reactions", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => boardThreadsTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").references(() => boardPostsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("board_reactions_user_target_reaction_unique").on(t.userId, t.threadId, t.postId, t.reaction),
  check("board_reactions_target_check", sql`(${t.threadId} IS NOT NULL) <> (${t.postId} IS NOT NULL)`),
  index("board_reactions_thread_id_idx").on(t.threadId),
  index("board_reactions_post_id_idx").on(t.postId),
]);

export type BoardReaction = typeof boardReactionsTable.$inferSelect;
