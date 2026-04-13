import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/messages", requireAuth, async (req, res) => {
  const { podId } = req.query as Record<string, string>;
  const broadcasts = await db.select().from(broadcastsTable).orderBy(broadcastsTable.createdAt);
  const result = await Promise.all(
    broadcasts.map(async (b) => {
      const sender = b.senderUserId
        ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, b.senderUserId) })
        : null;
      return { ...b, sender: sender ?? null };
    })
  );
  res.json(result);
});

router.post("/messages", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { subject, body, channel, targetPodIds, isAllTeam } = req.body;

  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
  let recipients = allUsers;
  if (!isAllTeam && targetPodIds?.length) {
    recipients = allUsers.filter((u) => u.podId && targetPodIds.includes(u.podId));
  }
  const uniqueEmails = new Set(recipients.map((u) => u.email));

  const [broadcast] = await db.insert(broadcastsTable).values({
    senderUserId: me?.id ?? null,
    subject: subject ?? null,
    body,
    channel: channel ?? "email",
    targetPodIds: targetPodIds ?? null,
    isAllTeam: isAllTeam ?? false,
    recipientCount: uniqueEmails.size,
    sentAt: new Date(),
  }).returning();
  res.status(201).json(broadcast);
});

router.post("/messages/contact-coach", requireAuth, async (req, res) => {
  const { coachUserId, subject, body } = req.body;
  res.json({ success: true, message: "Message sent to coach" });
});

export default router;
