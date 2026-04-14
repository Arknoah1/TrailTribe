import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  householdsTable,
  inviteLinksTable,
} from "@workspace/db";
import { eq, and, ilike, or, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { randomBytes } from "crypto";
import { createClerkClient } from "@clerk/express";
import { z } from "zod";

const notificationPreferencesSchema = z.object({
  practiceReminders: z.boolean(),
  coachMessages: z.boolean(),
  carpoolUpdates: z.boolean(),
  eventReminders: z.boolean(),
  rosterUpdates: z.boolean(),
});

const router = Router();

const DEFAULT_NOTIFICATION_PREFS = {
  practiceReminders: true,
  coachMessages: true,
  carpoolUpdates: true,
  eventReminders: true,
  rosterUpdates: true,
};

async function getOrCreateUser(clerkUserId: string): Promise<typeof usersTable.$inferSelect | null> {
  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (user) return user;

  try {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@trailtribe.app`;
    const firstName = clerkUser.firstName ?? "New";
    const lastName = clerkUser.lastName ?? "User";

    const existing = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });
    if (existing) {
      [user] = await db.update(usersTable)
        .set({ clerkUserId })
        .where(eq(usersTable.id, existing.id))
        .returning();
    } else {
      [user] = await db.insert(usersTable).values({
        clerkUserId,
        firstName,
        lastName,
        email,
        role: "parent",
        notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
      }).returning();
    }
    return user ?? null;
  } catch {
    return null;
  }
}

router.get("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  let user = await getOrCreateUser(clerkUserId);
  if (!user) {
    res.status(404).json({ error: "User not found and could not be auto-created" });
    return;
  }
  // Backfill notification prefs for existing accounts that predate the column
  if (!user.notificationPreferences && user.role !== "student") {
    const [updated] = await db.update(usersTable)
      .set({ notificationPreferences: DEFAULT_NOTIFICATION_PREFS })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated ?? user;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(user);
});

router.post("/users/me/household", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.householdId) { res.status(409).json({ error: "User already has a household" }); return; }

  const { name, emergencyContactName, emergencyContactPhone } = req.body;
  if (!name) { res.status(400).json({ error: "Family name is required" }); return; }

  const inviteCode = randomBytes(6).toString("hex");
  const [household] = await db.insert(householdsTable).values({
    name,
    inviteCode,
    emergencyContactName: emergencyContactName ?? null,
    emergencyContactPhone: emergencyContactPhone ?? null,
  }).returning();

  const [updated] = await db.update(usersTable)
    .set({ householdId: household.id })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.status(201).json({ household, user: updated });
});

router.post("/users/me/join", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.householdId) { res.status(409).json({ error: "Already in a household" }); return; }

  const { inviteCode } = req.body;
  if (!inviteCode) { res.status(400).json({ error: "Invite code is required" }); return; }

  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.inviteCode, inviteCode),
  });
  if (!household) { res.status(404).json({ error: "Invalid invite code" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ householdId: household.id, podId: household.podId ?? null, approved: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({ household, user: updated });
});

router.patch("/users/:id/pod", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { podId } = req.body;
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ podId: podId ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/users/:id/role", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { role } = req.body;
  if (!["parent", "coach"].includes(role)) {
    res.status(400).json({ error: "Role must be 'parent' or 'coach'" });
    return;
  }
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
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
    notificationsEnabled, emailNotifications, smsNotifications, pushNotifications,
    notificationPreferences,
  } = req.body;

  let validatedPrefs: typeof DEFAULT_NOTIFICATION_PREFS | undefined;
  if (notificationPreferences !== undefined) {
    const parsed = notificationPreferencesSchema.safeParse(notificationPreferences);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid notificationPreferences", details: parsed.error.issues });
      return;
    }
    validatedPrefs = parsed.data;
  }

  const [updated] = await db.update(usersTable)
    .set({ firstName, lastName, phone, avatarUrl, gender, grade,
      notificationsEnabled, emailNotifications, smsNotifications, pushNotifications,
      notificationPreferences: validatedPrefs,
    })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(updated);
});

// PATCH /api/users/me — partial update (used by notification toggles auto-save)
router.patch("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const {
    firstName, lastName, phone, avatarUrl, gender, grade,
    notificationsEnabled, emailNotifications, smsNotifications, pushNotifications,
    notificationPreferences,
  } = req.body;

  const patch: Record<string, any> = {};
  if (firstName !== undefined) patch.firstName = firstName;
  if (lastName !== undefined) patch.lastName = lastName;
  if (phone !== undefined) patch.phone = phone;
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;
  if (gender !== undefined) patch.gender = gender;
  if (grade !== undefined) patch.grade = grade;
  if (notificationsEnabled !== undefined) patch.notificationsEnabled = notificationsEnabled;
  if (emailNotifications !== undefined) patch.emailNotifications = emailNotifications;
  if (smsNotifications !== undefined) patch.smsNotifications = smsNotifications;
  if (pushNotifications !== undefined) patch.pushNotifications = pushNotifications;
  if (notificationPreferences !== undefined) {
    const parsed = notificationPreferencesSchema.safeParse(notificationPreferences);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid notificationPreferences shape", details: parsed.error.issues });
      return;
    }
    patch.notificationPreferences = parsed.data;
  }

  if (Object.keys(patch).length === 0) { res.json(user); return; }

  const [updated] = await db.update(usersTable)
    .set(patch)
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
  // Students are never in the approval flow — they're added directly by parents
  const pending = await db.select().from(usersTable)
    .where(and(eq(usersTable.approved, false), or(eq(usersTable.role, "parent"), eq(usersTable.role, "coach"))));
  res.json(pending);
});

router.post("/pending-approvals/:id/approve", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { podId, householdId, role } = req.body;

  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const updates: Record<string, any> = {
    approved: true,
    role: role ?? existing.role,
    householdId: householdId !== undefined ? householdId : existing.householdId,
  };
  // Pod assignment only applies to coaches, not parents
  if (podId && existing.role !== "parent") updates.podId = podId;

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
