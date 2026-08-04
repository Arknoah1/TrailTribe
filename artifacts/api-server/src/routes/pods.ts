import { Router } from "express";
import { db } from "@workspace/db";
import { podsTable, usersTable, householdsTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { z } from "zod";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const podBodySchema = z.object({
  name: z.string().min(1, "Pod name is required"),
  description: z.string().nullable().optional(),
  headCoachId: z.number().int().nullable().optional(),
  color: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/pods", requireAuth, async (req, res) => {
  const pods = await db.select().from(podsTable).orderBy(asc(podsTable.sortOrder), asc(podsTable.id));
  const result = await Promise.all(
    pods.map(async (pod) => {
      const members = await db.select().from(usersTable).where(eq(usersTable.podId, String(pod.id)));
      const students = members.filter((m) => m.role === "student");
      const coaches = members.filter((m) => m.role === "coach" || m.role === "admin");
      const households = await db.select().from(householdsTable).where(eq(householdsTable.podId, String(pod.id)));
      const totalHouseholds = households.length;
      const compliantHouseholds = households.filter(
        (h) => h.liabilityWaiverSigned && h.mediaReleaseSigned && h.codeOfConductSigned
      ).length;
      const complianceRate = totalHouseholds > 0 ? (compliantHouseholds / totalHouseholds) * 100 : 0;
      return {
        ...pod,
        studentCount: students.length,
        coachCount: coaches.length,
        complianceRate,
      };
    })
  );
  res.json(result);
});

router.post("/pods/reorder", requireCoachOrAdmin, async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids must be an array" });
    return;
  }
  await Promise.all(
    ids.map((id, index) =>
      db.update(podsTable).set({ sortOrder: index }).where(eq(podsTable.id, id))
    )
  );
  res.status(204).send();
});

router.post("/pods", requireCoachOrAdmin, async (req, res) => {
  const parsed = podBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, description, headCoachId, color, season } = parsed.data;
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(podsTable);
  const [pod] = await db.insert(podsTable).values({
    name,
    description: description ?? null,
    headCoachId: headCoachId ?? null,
    color: color ?? null,
    season: season ?? null,
    sortOrder: (maxRow?.max ?? -1) + 1,
  }).returning();
  res.status(201).json(pod);
});

router.get("/pods/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const pod = await db.query.podsTable.findFirst({ where: eq(podsTable.id, id) });
  if (!pod) {
    res.status(404).json({ error: "Pod not found" });
    return;
  }
  const members = await db.select().from(usersTable).where(eq(usersTable.podId, String(id)));
  const coaches = members.filter((m) => m.role === "coach" || m.role === "admin");
  res.json({ ...pod, members, coaches });
});

router.patch("/pods/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const parsed = podBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, description, headCoachId, color, season, isActive } = parsed.data;
  const [updated] = await db.update(podsTable)
    .set({ name, description, headCoachId, color, season, isActive })
    .where(eq(podsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/pods/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.update(usersTable).set({ podId: null }).where(eq(usersTable.podId, String(id)));
  await db.update(householdsTable).set({ podId: null }).where(eq(householdsTable.podId, String(id)));
  await db.delete(podsTable).where(eq(podsTable.id, id));
  res.status(204).send();
});

export default router;
