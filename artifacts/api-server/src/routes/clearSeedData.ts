/**
 * ONE-TIME endpoint to clear seed data from production.
 * DELETE THIS FILE after use.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireCoachOrAdmin } from "../middlewares/requireAuth";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/admin/clear-seed-data", requireCoachOrAdmin, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me || (me.role !== "coach" && me.role !== "admin")) {
    res.status(403).json({ error: "Coaches and admins only" });
    return;
  }

  const results: Record<string, number> = {};

  const run = async (label: string, query: string) => {
    const r = await db.execute(sql.raw(query));
    results[label] = (r as any).rowCount ?? 0;
  };

  await run("event_task_signups",      "DELETE FROM event_task_signups");
  await run("event_tasks",             "DELETE FROM event_tasks");
  await run("event_rsvps",             "DELETE FROM event_rsvps");
  await run("event_attachments",       "DELETE FROM event_attachments");
  await run("carpool_claims",          "DELETE FROM carpool_claims");
  await run("carpool_requests",        "DELETE FROM carpool_requests");
  await run("carpool_offers",          "DELETE FROM carpool_offers");
  await run("board_posts",             "DELETE FROM board_posts");
  await run("board_threads",           "DELETE FROM board_threads");
  await run("notifications",           "DELETE FROM notifications");
  await run("broadcasts",              "DELETE FROM broadcasts");
  await run("invite_links",            "DELETE FROM invite_links");
  await run("season_roster_snapshots", "DELETE FROM season_roster_snapshots");
  await run("seasons",                 "DELETE FROM seasons");
  await run("team_documents",          "DELETE FROM team_documents");
  await run("events_unlink_series",    "UPDATE events SET series_id = NULL");
  await run("events",                  "DELETE FROM events");
  await run("pods",                    "DELETE FROM pods");
  await run("seed_users",              "DELETE FROM users WHERE clerk_user_id IS NULL");
  await run("orphaned_households",     "DELETE FROM households WHERE id NOT IN (SELECT DISTINCT household_id FROM users WHERE household_id IS NOT NULL)");

  res.json({ ok: true, deleted: results });
});

export default router;
