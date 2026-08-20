import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushDevicesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
const allowedPlatforms = new Set(["ios", "android"]);

async function currentUser(req: any) {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, req.clerkUserId),
  });
}

router.post("/push-devices", requireAuth, async (req, res) => {
  const me = await currentUser(req);
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "";
  if (!token || token.length > 4096 || !allowedPlatforms.has(platform)) {
    res.status(400).json({ error: "A valid push token and platform are required" });
    return;
  }

  await db.insert(pushDevicesTable).values({
    userId: me.id,
    token,
    platform,
  }).onConflictDoUpdate({
    target: pushDevicesTable.token,
    set: { userId: me.id, platform, updatedAt: new Date() },
  });
  res.status(204).send();
});

router.delete("/push-devices/:token", requireAuth, async (req, res) => {
  const me = await currentUser(req);
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const rawToken = req.params.token;
  const token = decodeURIComponent(Array.isArray(rawToken) ? rawToken[0] : rawToken);
  await db.delete(pushDevicesTable).where(and(
    eq(pushDevicesTable.userId, me.id),
    eq(pushDevicesTable.token, token),
  ));
  res.status(204).send();
});

router.delete("/push-devices", requireAuth, async (req, res) => {
  const me = await currentUser(req);
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  await db.delete(pushDevicesTable).where(eq(pushDevicesTable.userId, me.id));
  res.status(204).send();
});

export default router;