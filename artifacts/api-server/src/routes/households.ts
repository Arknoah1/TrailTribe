import { Router } from "express";
import { db } from "@workspace/db";
import { householdsTable, usersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { publicLookupLimiter } from "../middlewares/rateLimiter";
import { randomBytes } from "crypto";
import { z } from "zod";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const studentNotifPrefsSchema = z.object({
  practiceReminders: z.boolean(),
  coachMessages: z.boolean(),
  eventReminders: z.boolean(),
}).partial();

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

const createHouseholdSchema = z.object({
  name: z.string().min(1, "Family name is required"),
  podId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
});

const updateHouseholdSchema = createHouseholdSchema.partial();

// ── Medical-field privacy helpers ──────────────────────────────────────────
const MEDICAL_FIELDS = ["allergies", "medications", "medicalNotes"] as const;

function stripMedical<T>(user: T): T {
  const u = { ...(user as Record<string, unknown>) };
  for (const f of MEDICAL_FIELDS) delete u[f];
  return u as T;
}

function shapeMedical<T>(user: T, canSee: boolean): T {
  return canSee ? user : stripMedical(user);
}

async function getRequester(req: any) {
  const clerkUserId = (req as any).clerkUserId as string | null;
  if (!clerkUserId) return null;
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

type Requester = Awaited<ReturnType<typeof getRequester>>;

function canSeeMedical(requester: Requester, householdId: number | null): boolean {
  if (!requester) return false;
  if (requester.role === "coach" || requester.role === "admin") return true;
  return householdId !== null && requester.householdId === householdId;
}

router.get("/households", requireApproved, async (req, res) => {
  const requester = await getRequester(req);
  const enrolledOnly = req.query.enrolledOnly === "true";
  const includeArchived = req.query.includeArchived === "true";

  let conditions: any[] = [];
  if (enrolledOnly) conditions.push(eq(householdsTable.seasonEnrolled, true));
  if (!includeArchived) conditions.push(isNull(householdsTable.archivedAt));

  const baseQuery = conditions.length > 0
    ? db.select().from(householdsTable).where(and(...conditions))
    : db.select().from(householdsTable);
  const households = await baseQuery;
  const result = await Promise.all(
    households.map(async (h) => {
      const members = await db.select().from(usersTable).where(eq(usersTable.householdId, h.id));
      const see = canSeeMedical(requester, h.id);
      return { ...h, members: members.map((m) => shapeMedical(m, see)) };
    })
  );
  res.json(result);
});

router.post("/households", requireAuth, async (req, res) => {
  const parsed = createHouseholdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, podId, address, emergencyContactName, emergencyContactPhone } = parsed.data;
  const [household] = await db.insert(householdsTable).values({
    name,
    inviteCode: generateInviteCode(),
    podId: podId ?? null,
    address: address ?? null,
    emergencyContactName: emergencyContactName ?? null,
    emergencyContactPhone: emergencyContactPhone ?? null,
  }).returning();
  res.status(201).json(household);
});

router.get("/households/by-invite/:code", publicLookupLimiter, async (req, res) => {
  const code = str(req.params.code);
  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.inviteCode, code),
  });
  if (!household) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }
  // Return safe public info only
  res.json({ id: household.id, name: household.name, inviteCode: household.inviteCode });
});

router.get("/households/:id", requireApproved, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return;
  }
  const [requester, members] = await Promise.all([
    getRequester(req),
    db.select().from(usersTable).where(eq(usersTable.householdId, id)),
  ]);
  const see = canSeeMedical(requester, id);
  res.json({ ...household, members: members.map((m) => shapeMedical(m, see)) });
});

router.patch("/households/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));

  // IDOR guard: requester must belong to this household or be coach/admin
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const parsed = updateHouseholdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, address, emergencyContactName, emergencyContactPhone } = parsed.data;
  const [updated] = await db.update(householdsTable)
    .set({ name, address, emergencyContactName, emergencyContactPhone })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/households/:id/compliance", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));

  // IDOR guard: requester must belong to this household or be coach/admin
  const complianceRequester = await getRequester(req);
  if (!complianceRequester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (complianceRequester.role !== "coach" && complianceRequester.role !== "admin" && complianceRequester.householdId !== id) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const { liabilityWaiverSigned, mediaReleaseSigned, codeOfConductSigned } = req.body;
  const now = new Date();
  const updates: Record<string, any> = {};
  if (liabilityWaiverSigned !== undefined) {
    updates.liabilityWaiverSigned = liabilityWaiverSigned;
    if (liabilityWaiverSigned) updates.liabilityWaiverSignedAt = now;
  }
  if (mediaReleaseSigned !== undefined) {
    updates.mediaReleaseSigned = mediaReleaseSigned;
    if (mediaReleaseSigned) updates.mediaReleaseSignedAt = now;
  }
  if (codeOfConductSigned !== undefined) {
    updates.codeOfConductSigned = codeOfConductSigned;
    if (codeOfConductSigned) updates.codeOfConductSignedAt = now;
  }
  const [updated] = await db.update(householdsTable).set(updates).where(eq(householdsTable.id, id)).returning();
  res.json(updated);
});

router.post("/households/:id/archive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }
  const [updated] = await db.update(householdsTable)
    .set({ archivedAt: new Date() })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.post("/households/:id/unarchive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }
  const [updated] = await db.update(householdsTable)
    .set({ archivedAt: null })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.get("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const [requester, riders] = await Promise.all([
    getRequester(req),
    db.select().from(usersTable).where(and(eq(usersTable.householdId, id), eq(usersTable.role, "student"))),
  ]);
  const see = canSeeMedical(requester, id);
  res.json(riders.map((r) => shapeMedical(r, see)));
});

router.post("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { firstName, lastName, grade, allergies, medications, medicalNotes, dateOfBirth, email, emailNotifications, notificationPreferences } = req.body;

  // IDOR guard: requester must belong to this household or be coach/admin
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!canSeeMedical(requester, id) && requester.role !== "coach" && requester.role !== "admin") {
    if (requester.householdId !== id) {
      res.status(403).json({ error: "Forbidden: you are not a member of this household" });
      return;
    }
  }

  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }

  // Validate and build canonical student prefs — carpool/roster are always false for students
  let studentPrefs = { practiceReminders: true, coachMessages: true, carpoolUpdates: false, eventReminders: true, rosterUpdates: false, boardReplies: true };
  if (notificationPreferences != null) {
    const parsedPrefs = studentNotifPrefsSchema.safeParse(notificationPreferences);
    if (!parsedPrefs.success) {
      res.status(400).json({ error: "Invalid notificationPreferences", details: parsedPrefs.error.issues });
      return;
    }
    const safePrefs = parsedPrefs.data;
    studentPrefs = {
      practiceReminders: safePrefs.practiceReminders ?? true,
      coachMessages: safePrefs.coachMessages ?? true,
      carpoolUpdates: false,
      eventReminders: safePrefs.eventReminders ?? true,
      rosterUpdates: false,
      boardReplies: true,
    };
  }

  const [rider] = await db.insert(usersTable).values({
    householdId: id,
    firstName,
    lastName,
    role: "student",
    podId: household.podId ?? null,
    email: (email && email.trim()) ? email.trim() : `rider-${randomBytes(6).toString("hex")}@trailtribe.internal`,
    emailNotifications: emailNotifications ?? false,
    smsNotifications: false,
    pushNotifications: false,
    notificationPreferences: studentPrefs,
    grade: grade ?? null,
    allergies: allergies ?? null,
    medications: medications ?? null,
    medicalNotes: medicalNotes ?? null,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
  }).returning();
  res.status(201).json(rider);
});

router.patch("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));

  // IDOR guard: requester must belong to this household or be coach/admin
  const patchRiderRequester = await getRequester(req);
  if (!patchRiderRequester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (patchRiderRequester.role !== "coach" && patchRiderRequester.role !== "admin" && patchRiderRequester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const { firstName, lastName, grade, allergies, medications, medicalNotes, email, emailNotifications, notificationPreferences } = req.body;

  const updates: Record<string, any> = {
    firstName, lastName,
    grade: grade ?? null,
    allergies: allergies ?? null,
    medications: medications ?? null,
    medicalNotes: medicalNotes ?? null,
  };
  if (email !== undefined) updates.email = email || `rider-${riderId}@trailtribe.internal`;
  if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;
  // Students cannot receive SMS or push notifications
  updates.smsNotifications = false;
  updates.pushNotifications = false;
  if (notificationPreferences !== undefined) {
    const parsedRiderPrefs = studentNotifPrefsSchema.safeParse(notificationPreferences);
    if (!parsedRiderPrefs.success) {
      res.status(400).json({ error: "Invalid notificationPreferences", details: parsedRiderPrefs.error.issues });
      return;
    }
    const safeRiderPrefs = parsedRiderPrefs.data;
    updates.notificationPreferences = {
      practiceReminders: safeRiderPrefs.practiceReminders ?? true,
      coachMessages: safeRiderPrefs.coachMessages ?? true,
      carpoolUpdates: false,
      eventReminders: safeRiderPrefs.eventReminders ?? true,
      rosterUpdates: false,
      boardReplies: true,
    };
  }

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Rider not found" }); return; }
  res.json(updated);
});

router.delete("/households/:id/members/:userId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const targetUserId = parseInt(str(req.params.userId));

  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Must be a member of this household OR coach/admin
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Cannot remove yourself
  if (requester.id === targetUserId) {
    res.status(400).json({ error: "Cannot remove yourself from a household" }); return;
  }

  // Find the target — must be an adult (non-student) in this household
  const target = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.id, targetUserId), eq(usersTable.householdId, householdId)),
  });
  if (!target || target.role === "student") { res.status(404).json({ error: "Member not found" }); return; }

  // Regular parents cannot remove a coach
  if (target.role === "coach" && requester.role !== "coach" && requester.role !== "admin") {
    res.status(403).json({ error: "Only coaches or admins can remove a coach" }); return;
  }

  // Detach from household — keep the user account intact
  await db.update(usersTable)
    .set({ householdId: null })
    .where(and(eq(usersTable.id, targetUserId), eq(usersTable.householdId, householdId)));

  res.status(204).send();
});

router.delete("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));

  // IDOR guard: requester must belong to this household or be coach/admin
  const deleteRequester = await getRequester(req);
  if (!deleteRequester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (deleteRequester.role !== "coach" && deleteRequester.role !== "admin" && deleteRequester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  await db.delete(usersTable)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId), eq(usersTable.role, "student")));
  res.status(204).send();
});

export default router;
