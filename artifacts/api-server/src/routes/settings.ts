import { Router } from "express";
import { db } from "@workspace/db";
import { teamSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCoachOrAdmin } from "../middlewares/requireAuth";
import { z } from "zod";

const router = Router();

async function getOrCreateSettings() {
  const existing = await db.query.teamSettingsTable.findFirst({
    where: eq(teamSettingsTable.id, 1),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(teamSettingsTable)
    .values({ id: 1, teamName: "" })
    .onConflictDoNothing()
    .returning();
  // If onConflictDoNothing returned nothing, re-fetch
  return created ?? (await db.query.teamSettingsTable.findFirst({ where: eq(teamSettingsTable.id, 1) }))!;
}

// GET /settings — return current team settings (coach/admin)
router.get("/settings", requireCoachOrAdmin, async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ teamName: settings.teamName ?? "" });
});

const updateSettingsSchema = z.object({
  teamName: z.string().max(100),
});

// PUT /settings — update team settings (coach/admin)
router.put("/settings", requireCoachOrAdmin, async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  // Upsert row id=1
  const [updated] = await db
    .insert(teamSettingsTable)
    .values({ id: 1, teamName: parsed.data.teamName })
    .onConflictDoUpdate({
      target: teamSettingsTable.id,
      set: { teamName: parsed.data.teamName },
    })
    .returning();

  res.json({ teamName: updated?.teamName ?? parsed.data.teamName });
});

export { getOrCreateSettings };
export default router;
