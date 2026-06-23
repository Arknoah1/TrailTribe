import { Router } from "express";
import { db } from "@workspace/db";
import {
  volunteerTemplateTasksTable,
  eventTasksTable,
  eventTaskSignupsTable,
  eventsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, count } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

// ─── TEMPLATE TASKS (admin only) ─────────────────────────────────────────────

router.get("/volunteer-tasks/templates", requireAuth, async (req, res) => {
  const templates = await db
    .select()
    .from(volunteerTemplateTasksTable)
    .orderBy(volunteerTemplateTasksTable.sortOrder, volunteerTemplateTasksTable.category);
  res.json(templates);
});

router.post("/volunteer-tasks/templates", requireAdmin, async (req, res) => {
  const { category, title, description, slotsDefault, sortOrder } = req.body;
  if (!category || !title) {
    res.status(400).json({ error: "category and title required" });
    return;
  }
  const [task] = await db.insert(volunteerTemplateTasksTable).values({
    category,
    title,
    description: description ?? null,
    slotsDefault: slotsDefault ?? 1,
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(task);
});

router.put("/volunteer-tasks/templates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { category, title, description, slotsDefault, sortOrder } = req.body;
  const [updated] = await db.update(volunteerTemplateTasksTable)
    .set({
      ...(category && { category }),
      ...(title && { title }),
      description: description ?? null,
      ...(slotsDefault !== undefined && { slotsDefault }),
      ...(sortOrder !== undefined && { sortOrder }),
    })
    .where(eq(volunteerTemplateTasksTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/volunteer-tasks/templates/:id", requireAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(volunteerTemplateTasksTable).where(eq(volunteerTemplateTasksTable.id, id));
  res.status(204).send();
});

// ─── VOLUNTEER TASKS ENABLED TOGGLE ──────────────────────────────────────────

router.patch("/events/:id/volunteer-tasks-enabled", requireCoachOrAdmin, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) required" });
    return;
  }
  await db.update(eventsTable).set({ volunteerTasksEnabled: enabled }).where(eq(eventsTable.id, eventId));
  res.json({ ok: true });
});

// ─── EVENT TASKS ──────────────────────────────────────────────────────────────

async function buildTaskWithSignups(task: typeof eventTasksTable.$inferSelect, clerkUserId?: string) {
  const signupRows = await db
    .select()
    .from(eventTaskSignupsTable)
    .where(eq(eventTaskSignupsTable.eventTaskId, task.id));

  const signupsWithUsers = await Promise.all(
    signupRows.map(async (s) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, s.userId) });
      return { ...s, user: user ?? null };
    })
  );

  let mySignup = null;
  if (clerkUserId) {
    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
    if (me) {
      mySignup = signupRows.find((s) => s.userId === me.id) ?? null;
    }
  }

  return { ...task, signups: signupsWithUsers, mySignup };
}

router.get("/events/:id/tasks", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const tasks = await db
    .select()
    .from(eventTasksTable)
    .where(eq(eventTasksTable.eventId, eventId))
    .orderBy(eventTasksTable.sortOrder, eventTasksTable.category);

  const result = await Promise.all(tasks.map((t) => buildTaskWithSignups(t, clerkUserId)));
  res.json(result);
});

// Admin-only: create event task
router.post("/events/:id/tasks", requireAdmin, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { category, title, description, slotsNeeded, sortOrder } = req.body;
  if (!category || !title) {
    res.status(400).json({ error: "category and title required" });
    return;
  }
  const [task] = await db.insert(eventTasksTable).values({
    eventId,
    category,
    title,
    description: description ?? null,
    slotsNeeded: slotsNeeded ?? 1,
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(task);
});

// Admin-only: clone all templates (or selected templates) to an event
router.post("/events/:id/tasks/clone-template", requireAdmin, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { templateTaskIds } = req.body as { templateTaskIds?: number[] };

  let templates;
  if (!templateTaskIds || templateTaskIds.length === 0) {
    templates = await db
      .select()
      .from(volunteerTemplateTasksTable)
      .orderBy(volunteerTemplateTasksTable.sortOrder, volunteerTemplateTasksTable.category);
  } else {
    templates = await db
      .select()
      .from(volunteerTemplateTasksTable)
      .where(inArray(volunteerTemplateTasksTable.id, templateTaskIds));
  }

  if (templates.length === 0) {
    res.status(404).json({ error: "No templates found" });
    return;
  }

  await db.insert(eventTasksTable).values(
    templates.map((t) => ({
      eventId,
      templateTaskId: t.id,
      category: t.category,
      title: t.title,
      description: t.description ?? null,
      slotsNeeded: t.slotsDefault,
      sortOrder: t.sortOrder,
    }))
  );

  res.status(201).json({ added: templates.length });
});

// Bulk signup: sign the current user up for multiple tasks; skip silently if already signed up or at capacity
router.post("/events/:id/tasks/bulk-signup", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { taskIds } = req.body as { taskIds?: number[] };
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    res.status(400).json({ error: "taskIds array required" });
    return;
  }

  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  let added = 0;
  let skipped = 0;

  for (const taskId of taskIds) {
    const task = await db.query.eventTasksTable.findFirst({
      where: and(eq(eventTasksTable.id, taskId), eq(eventTasksTable.eventId, eventId)),
    });
    if (!task) { skipped++; continue; }

    const existing = await db.query.eventTaskSignupsTable.findFirst({
      where: and(eq(eventTaskSignupsTable.eventTaskId, taskId), eq(eventTaskSignupsTable.userId, me.id)),
    });
    if (existing) { skipped++; continue; }

    const [{ currentCount }] = await db
      .select({ currentCount: count() })
      .from(eventTaskSignupsTable)
      .where(eq(eventTaskSignupsTable.eventTaskId, taskId));

    if (currentCount >= task.slotsNeeded) { skipped++; continue; }

    await db.insert(eventTaskSignupsTable).values({
      eventTaskId: taskId,
      eventId,
      userId: me.id,
      notes: null,
    });
    added++;
  }

  res.status(201).json({ added, skipped });
});

// Admin-only: update event task
router.patch("/events/:id/tasks/:taskId", requireAdmin, async (req, res) => {
  const taskId = parseInt(str(req.params.taskId));
  const { category, title, description, slotsNeeded, sortOrder } = req.body;
  const [updated] = await db.update(eventTasksTable)
    .set({
      ...(category && { category }),
      ...(title && { title }),
      description: description ?? null,
      ...(slotsNeeded !== undefined && { slotsNeeded }),
      ...(sortOrder !== undefined && { sortOrder }),
    })
    .where(eq(eventTasksTable.id, taskId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// Admin-only: delete event task
router.delete("/events/:id/tasks/:taskId", requireAdmin, async (req, res) => {
  const taskId = parseInt(str(req.params.taskId));
  await db.delete(eventTasksTable).where(eq(eventTasksTable.id, taskId));
  res.status(204).send();
});

// ─── TASK SIGNUPS ─────────────────────────────────────────────────────────────

router.post("/events/:id/tasks/:taskId/signup", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const taskId = parseInt(str(req.params.taskId));
  const clerkUserId = (req as any).clerkUserId;
  const { notes } = req.body ?? {};

  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const task = await db.query.eventTasksTable.findFirst({
    where: and(eq(eventTasksTable.id, taskId), eq(eventTasksTable.eventId, eventId)),
  });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const existing = await db.query.eventTaskSignupsTable.findFirst({
    where: and(eq(eventTaskSignupsTable.eventTaskId, taskId), eq(eventTaskSignupsTable.userId, me.id)),
  });
  if (existing) { res.status(409).json({ error: "Already signed up" }); return; }

  const [{ currentCount }] = await db
    .select({ currentCount: count() })
    .from(eventTaskSignupsTable)
    .where(eq(eventTaskSignupsTable.eventTaskId, taskId));

  if (currentCount >= task.slotsNeeded) {
    res.status(409).json({ error: "Task is at capacity" });
    return;
  }

  const [signup] = await db.insert(eventTaskSignupsTable).values({
    eventTaskId: taskId,
    eventId,
    userId: me.id,
    notes: notes ?? null,
  }).returning();

  try {
    const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, eventId) });
    if (event) {
      await db.insert(notificationsTable).values({
        recipientUserId: me.id,
        type: "volunteer_signup",
        title: "Volunteer sign-up confirmed",
        body: `You're signed up for "${task.title}" at ${event.title}.`,
        link: `/events/${eventId}`,
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to create volunteer signup notification");
  }

  res.status(201).json(signup);
});

router.delete("/events/:id/tasks/:taskId/signup", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const taskId = parseInt(str(req.params.taskId));
  const clerkUserId = (req as any).clerkUserId;

  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  await db.delete(eventTaskSignupsTable).where(
    and(eq(eventTaskSignupsTable.eventTaskId, taskId), eq(eventTaskSignupsTable.userId, me.id))
  );

  res.status(204).send();
});

// ─── MY VOLUNTEER COMMITMENTS ─────────────────────────────────────────────────

router.get("/users/me/volunteer-signups", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const signups = await db
    .select()
    .from(eventTaskSignupsTable)
    .where(eq(eventTaskSignupsTable.userId, me.id));

  const enriched = await Promise.all(
    signups.map(async (s) => {
      const task = await db.query.eventTasksTable.findFirst({ where: eq(eventTasksTable.id, s.eventTaskId) });
      const event = task
        ? await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, task.eventId) })
        : null;
      return { ...s, task: task ?? null, event: event ?? null };
    })
  );

  enriched.sort((a, b) => {
    const aTime = a.event?.startTime?.getTime() ?? 0;
    const bTime = b.event?.startTime?.getTime() ?? 0;
    return aTime - bTime;
  });

  res.json(enriched);
});

export default router;
