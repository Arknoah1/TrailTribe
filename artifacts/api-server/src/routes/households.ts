import { Router } from "express";
import { db } from "@workspace/db";
import { householdsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
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

router.get("/households", requireAuth, async (req, res) => {
  const households = await db.select().from(householdsTable);
  const result = await Promise.all(
    households.map(async (h) => {
      const members = await db.select().from(usersTable).where(eq(usersTable.householdId, h.id));
      return { ...h, members };
    })
  );
  res.json(result);
});

router.post("/households", requireAuth, async (req, res) => {
  const { name, podId, address, emergencyContactName, emergencyContactPhone } = req.body;
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

router.get("/households/by-invite/:code", async (req, res) => {
  const { code } = req.params;
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

router.get("/households/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return;
  }
  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, id));
  res.json({ ...household, members });
});

router.patch("/households/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { name, address, emergencyContactName, emergencyContactPhone } = req.body;
  const [updated] = await db.update(householdsTable)
    .set({ name, address, emergencyContactName, emergencyContactPhone })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/households/:id/compliance", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
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

router.get("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const riders = await db.select().from(usersTable)
    .where(and(eq(usersTable.householdId, id), eq(usersTable.role, "student")));
  res.json(riders);
});

router.post("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { firstName, lastName, grade, allergies, medications, medicalNotes, dateOfBirth, email, emailNotifications, notificationPreferences } = req.body;
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }

  // Validate and build canonical student prefs — carpool/roster are always false for students
  let studentPrefs = { practiceReminders: true, coachMessages: true, carpoolUpdates: false, eventReminders: true, rosterUpdates: false };
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
    };
  }

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Rider not found" }); return; }
  res.json(updated);
});

router.delete("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));
  await db.delete(usersTable)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId), eq(usersTable.role, "student")));
  res.status(204).send();
});

export default router;
