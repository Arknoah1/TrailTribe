import { Router } from "express";
import { db } from "@workspace/db";
import { trailheadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

router.get("/trailheads", requireAuth, async (req, res) => {
  const trailheads = await db.select().from(trailheadsTable).orderBy(trailheadsTable.name);
  res.json(trailheads);
});

router.post("/trailheads", requireAuth, async (req, res) => {
  const { name, address, googleMapsUrl, latitude, longitude, notes } = req.body;
  const [trailhead] = await db.insert(trailheadsTable).values({
    name,
    address: address ?? null,
    googleMapsUrl: googleMapsUrl ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(trailhead);
});

router.patch("/trailheads/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { name, address, googleMapsUrl, latitude, longitude, notes } = req.body;
  const [updated] = await db.update(trailheadsTable)
    .set({ name, address, googleMapsUrl, latitude, longitude, notes })
    .where(eq(trailheadsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/trailheads/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(trailheadsTable).where(eq(trailheadsTable.id, id));
  res.status(204).send();
});

export default router;
