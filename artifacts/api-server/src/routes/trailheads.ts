import { Router } from "express";
import { db } from "@workspace/db";
import { trailheadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

router.get("/trailheads", requireApproved, async (req, res) => {
  const trailheads = await db.select().from(trailheadsTable).orderBy(trailheadsTable.name);
  res.json(trailheads);
});

router.post("/trailheads", requireCoachOrAdmin, async (req, res) => {
  const { name, address, googleMapsUrl, latitude, longitude, notes, photoObjectPath } = req.body;
  const [trailhead] = await db.insert(trailheadsTable).values({
    name,
    address: address ?? null,
    googleMapsUrl: googleMapsUrl ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    notes: notes ?? null,
    photoObjectPath: photoObjectPath ?? null,
  }).returning();
  res.status(201).json(trailhead);
});

router.patch("/trailheads/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { name, address, googleMapsUrl, latitude, longitude, notes, photoObjectPath } = req.body;
  const [updated] = await db.update(trailheadsTable)
    .set({ name, address, googleMapsUrl, latitude, longitude, notes, photoObjectPath: photoObjectPath ?? null })
    .where(eq(trailheadsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/trailheads/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(trailheadsTable).where(eq(trailheadsTable.id, id));
  res.status(204).send();
});

export default router;
