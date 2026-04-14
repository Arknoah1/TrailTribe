import { Router } from "express";
import { db } from "@workspace/db";
import { inviteLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/requireAuth";
import { randomBytes } from "crypto";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

router.get("/invites", requireAuth, async (req, res) => {
  const invites = await db.select().from(inviteLinksTable).orderBy(inviteLinksTable.createdAt);
  res.json(invites);
});

router.post("/invites", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const { householdId, podId, label } = req.body;
  const code = randomBytes(8).toString("hex");
  const [invite] = await db.insert(inviteLinksTable).values({
    code,
    householdId: householdId ?? null,
    podId: podId ?? null,
    label: label ?? null,
    isActive: true,
    usageCount: 0,
  }).returning();
  res.status(201).json(invite);
});

router.get("/invites/:code", optionalAuth, async (req, res) => {
  const code = str(req.params.code);
  const invite = await db.query.inviteLinksTable.findFirst({ where: eq(inviteLinksTable.code, code) });
  if (!invite || !invite.isActive) {
    res.status(404).json({ error: "Invite link not found or expired" });
    return;
  }
  res.json(invite);
});

router.patch("/invites/:id/deactivate", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const [updated] = await db.update(inviteLinksTable)
    .set({ isActive: false })
    .where(eq(inviteLinksTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
