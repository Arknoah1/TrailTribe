import { Router } from "express";
import { db } from "@workspace/db";
import { householdsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { randomBytes } from "crypto";

const router = Router();

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
  const id = parseInt(req.params.id);
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return;
  }
  const members = await db.select().from(usersTable).where(eq(usersTable.householdId, id));
  res.json({ ...household, members });
});

router.patch("/households/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, emergencyContactName, emergencyContactPhone } = req.body;
  const [updated] = await db.update(householdsTable)
    .set({ name, address, emergencyContactName, emergencyContactPhone })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/households/:id/compliance", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
  const riders = await db.select().from(usersTable)
    .where(and(eq(usersTable.householdId, id), eq(usersTable.role, "student")));
  res.json(riders);
});

router.post("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { firstName, lastName, grade, allergies, medications, medicalNotes, dateOfBirth } = req.body;
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }

  const [rider] = await db.insert(usersTable).values({
    householdId: id,
    firstName,
    lastName,
    role: "student",
    podId: household.podId ?? null,
    email: `rider-${randomBytes(6).toString("hex")}@trailtribe.internal`,
    grade: grade ?? null,
    allergies: allergies ?? null,
    medications: medications ?? null,
    medicalNotes: medicalNotes ?? null,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
  }).returning();
  res.status(201).json(rider);
});

router.patch("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(req.params.id);
  const riderId = parseInt(req.params.riderId);
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
  if (notificationPreferences !== undefined) updates.notificationPreferences = notificationPreferences;

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Rider not found" }); return; }
  res.json(updated);
});

router.delete("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(req.params.id);
  const riderId = parseInt(req.params.riderId);
  await db.delete(usersTable)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId), eq(usersTable.role, "student")));
  res.status(204).send();
});

export default router;
