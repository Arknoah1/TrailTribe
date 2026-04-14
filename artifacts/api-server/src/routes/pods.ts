import { Router } from "express";
import { db } from "@workspace/db";
import { podsTable, usersTable, householdsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

router.get("/pods", requireAuth, async (req, res) => {
  const pods = await db.select().from(podsTable);
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

router.post("/pods", requireAuth, async (req, res) => {
  const { name, description, headCoachId, color, season } = req.body;
  const [pod] = await db.insert(podsTable).values({
    name,
    description: description ?? null,
    headCoachId: headCoachId ?? null,
    color: color ?? null,
    season: season ?? null,
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

router.patch("/pods/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { name, description, headCoachId, color, season, isActive } = req.body;
  const [updated] = await db.update(podsTable)
    .set({ name, description, headCoachId, color, season, isActive })
    .where(eq(podsTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
