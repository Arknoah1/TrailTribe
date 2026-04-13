import { Router } from "express";
import { db } from "@workspace/db";
import { householdsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
