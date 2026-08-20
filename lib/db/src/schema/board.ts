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

export const boardPostsTable = pgTable("board_posts", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => boardThreadsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
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
