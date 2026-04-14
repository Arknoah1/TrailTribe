import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

router.get("/notifications", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.recipientUserId, me.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(notifications);
});

router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.recipientUserId, me.id), eq(notificationsTable.isRead, false)));
  res.json({ success: true });
});

router.delete("/notifications/:id", requireAuth, async (req, res) => {
  const notifId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const existing = await db.query.notificationsTable.findFirst({
    where: and(eq(notificationsTable.id, notifId), eq(notificationsTable.recipientUserId, me.id)),
  });
  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  await db.delete(notificationsTable).where(eq(notificationsTable.id, notifId));
  res.status(204).send();
});

export default router;
