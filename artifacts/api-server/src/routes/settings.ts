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
    .values({ id: 1, teamName: "", shortName: "" })
    .onConflictDoNothing()
    .returning();
  // If onConflictDoNothing returned nothing, re-fetch
  return created ?? (await db.query.teamSettingsTable.findFirst({ where: eq(teamSettingsTable.id, 1) }))!;
}

/**
 * Returns a subject-line prefix like "Methow Cycling: " when a short name is
 * configured, or "" when it isn't. Use it as:
 *   subject: `${await getShortNamePrefix()}Your actual subject here`
 */
async function getShortNamePrefix(): Promise<string> {
  const settings = await getOrCreateSettings();
  const short = settings.shortName?.trim();
  return short ? `${short}: ` : "";
}

// GET /settings — return current team settings (coach/admin)
router.get("/settings", requireCoachOrAdmin, async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json({
    teamName: settings.teamName ?? "",
    shortName: settings.shortName ?? "",
  });
});

const updateSettingsSchema = z.object({
  teamName: z.string().max(100),
  shortName: z.string().max(60),
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
    .values({ id: 1, teamName: parsed.data.teamName, shortName: parsed.data.shortName })
    .onConflictDoUpdate({
      target: teamSettingsTable.id,
      set: { teamName: parsed.data.teamName, shortName: parsed.data.shortName },
    })
    .returning();

  res.json({
    teamName: updated?.teamName ?? parsed.data.teamName,
    shortName: updated?.shortName ?? parsed.data.shortName,
  });
});

export { getOrCreateSettings, getShortNamePrefix };
export default router;
