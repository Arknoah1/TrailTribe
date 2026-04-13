import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  householdsTable,
  inviteLinksTable,
} from "@workspace/db";
import { eq, and, ilike, or, isNull, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { randomBytes } from "crypto";

const router = Router();

router.get("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.put("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const {
    firstName, lastName, phone, avatarUrl, gender, grade,
    notificationsEnabled, emailNotifications, smsNotifications, pushNotifications
  } = req.body;
  const [updated] = await db.update(usersTable)
    .set({ firstName, lastName, phone, avatarUrl, gender, grade,
      notificationsEnabled, emailNotifications, smsNotifications, pushNotifications })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(updated);
});

router.post("/users/onboard", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const { firstName, lastName, phone, role, inviteCode } = req.body;

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (existing) {
    res.status(201).json(existing);
    return;
  }

  let householdId: number | null = null;
  let podId: string | null = null;

  if (inviteCode) {
    const invite = await db.query.inviteLinksTable.findFirst({
      where: and(eq(inviteLinksTable.code, inviteCode), eq(inviteLinksTable.isActive, true)),
    });
    if (invite) {
      householdId = invite.householdId ?? null;
      podId = invite.podId ?? null;
      await db.update(inviteLinksTable)
        .set({ usageCount: (invite.usageCount ?? 0) + 1 })
        .where(eq(inviteLinksTable.id, invite.id));
    }
  }

  const [user] = await db.insert(usersTable).values({
    clerkUserId,
    firstName,
    lastName,
    phone: phone ?? null,
    role: role ?? "parent",
    householdId,
    podId,
    email: `${clerkUserId}@pending.trailtribe.app`,
  }).returning();

  res.status(201).json(user);
});

router.get("/users", requireAuth, async (req, res) => {
  const { role, podId, search } = req.query as Record<string, string>;
  let query = db.select().from(usersTable);
  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role as any));
  if (podId) conditions.push(eq(usersTable.podId, podId));
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
      )!
    );
  }
  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);
  res.json(users);
});

router.get("/users/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.patch("/users/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, phone, role, podId, householdId,
    notificationsEnabled, emailNotifications, smsNotifications, pushNotifications,
    isActive } = req.body;
  const [updated] = await db.update(usersTable)
    .set({ firstName, lastName, phone, role, podId, householdId,
      notificationsEnabled, emailNotifications, smsNotifications, pushNotifications, isActive })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

router.get("/pending-approvals", requireAuth, async (req, res) => {
  const pending = await db.select().from(usersTable)
    .where(isNull(usersTable.podId));
  res.json(pending);
});

router.post("/pending-approvals/:id/approve", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { podId, householdId, role } = req.body;
  const [updated] = await db.update(usersTable)
    .set({ podId, householdId: householdId ?? null, role })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
