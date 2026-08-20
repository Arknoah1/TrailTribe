import { Router } from "express";
import { db } from "@workspace/db";
import {
  volunteerTemplateTasksTable,
  volunteerTaskPacksTable,
  volunteerTaskPackTasksTable,
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

router.get("/volunteer-tasks/templates", requireCoachOrAdmin, async (req, res) => {
  const templates = await db
    .select()
    .from(volunteerTemplateTasksTable)
    .orderBy(volunteerTemplateTasksTable.sortOrder, volunteerTemplateTasksTable.category);
  res.json(templates);
});

router.post("/volunteer-tasks/templates", requireCoachOrAdmin, async (req, res) => {
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

router.put("/volunteer-tasks/templates/:id", requireCoachOrAdmin, async (req, res) => {
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

router.delete("/volunteer-tasks/templates/:id", requireCoachOrAdmin, async (req, res) => {
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

// Coach or admin: create event task
router.post("/events/:id/tasks", requireCoachOrAdmin, async (req, res) => {
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

// Coach or admin: clone all templates (or selected templates) to an event
router.post("/events/:id/tasks/clone-template", requireCoachOrAdmin, async (req, res) => {
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

  // Preserve request order while ensuring repeated IDs cannot attempt a second
  // insert after the initial signup snapshot was taken.
  const uniqueTaskIds = [...new Set(taskIds)];

  // Batch-fetch tasks and this user's existing signups up front (2 queries
  // total instead of 2 per taskId) to weed out invalid/duplicate requests.
  const tasks = await db.select().from(eventTasksTable)
    .where(and(inArray(eventTasksTable.id, uniqueTaskIds), eq(eventTasksTable.eventId, eventId)));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  const existingSignups = await db.select({ eventTaskId: eventTaskSignupsTable.eventTaskId })
    .from(eventTaskSignupsTable)
    .where(and(inArray(eventTaskSignupsTable.eventTaskId, uniqueTaskIds), eq(eventTaskSignupsTable.userId, me.id)));
  const alreadySignedUp = new Set(existingSignups.map((s) => s.eventTaskId));

  let added = 0;
  let skipped = 0;

  for (const taskId of uniqueTaskIds) {
    const task = tasksById.get(taskId);
    if (!task || alreadySignedUp.has(taskId)) { skipped++; continue; }

    // Capacity check + insert still need to be transactional per task, since
    // two concurrent bulk-signups could both target the same last-open slot.
    const inserted = await db.transaction(async (tx) => {
      const [lockedTask] = await tx.select().from(eventTasksTable)
        .where(and(eq(eventTasksTable.id, taskId), eq(eventTasksTable.eventId, eventId)))
        .for("update");
      if (!lockedTask) return false;

      const [{ currentCount }] = await tx
        .select({ currentCount: count() })
        .from(eventTaskSignupsTable)
        .where(eq(eventTaskSignupsTable.eventTaskId, taskId));
      if (currentCount >= lockedTask.slotsNeeded) return false;

      await tx.insert(eventTaskSignupsTable).values({
        eventTaskId: taskId,
        eventId,
        userId: me.id,
        notes: null,
      });
      return true;
    });

    if (inserted) {
      added++;
      alreadySignedUp.add(taskId);
    } else {
      skipped++;
    }
  }

  res.status(201).json({ added, skipped });
});

// Coach or admin: update event task
router.patch("/events/:id/tasks/:taskId", requireCoachOrAdmin, async (req, res) => {
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

// Coach or admin: delete event task
router.delete("/events/:id/tasks/:taskId", requireCoachOrAdmin, async (req, res) => {
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

  const result = await db.transaction(async (tx) => {
    // Lock the task row for the duration of this transaction so two concurrent
    // signups for the last slot cannot both pass the capacity check below.
    const [task] = await tx.select().from(eventTasksTable)
      .where(and(eq(eventTasksTable.id, taskId), eq(eventTasksTable.eventId, eventId)))
      .for("update");
    if (!task) return { status: 404 as const, error: "Task not found" };

    const existing = await tx.query.eventTaskSignupsTable.findFirst({
      where: and(eq(eventTaskSignupsTable.eventTaskId, taskId), eq(eventTaskSignupsTable.userId, me.id)),
    });
    if (existing) return { status: 409 as const, error: "Already signed up" };

    const [{ currentCount }] = await tx
      .select({ currentCount: count() })
      .from(eventTaskSignupsTable)
      .where(eq(eventTaskSignupsTable.eventTaskId, taskId));

    if (currentCount >= task.slotsNeeded) {
      return { status: 409 as const, error: "Task is at capacity" };
    }

    const [signup] = await tx.insert(eventTaskSignupsTable).values({
      eventTaskId: taskId,
      eventId,
      userId: me.id,
      notes: notes ?? null,
    }).returning();

    return { status: 201 as const, signup, task };
  });

  if (result.status !== 201) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { signup, task } = result;

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

// Coach/admin: remove a specific volunteer signup by signupId
router.delete("/events/:id/tasks/:taskId/signups/:signupId", requireCoachOrAdmin, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const taskId = parseInt(str(req.params.taskId));
  const signupId = parseInt(str(req.params.signupId));

  // Verify the task belongs to this event
  const task = await db.query.eventTasksTable.findFirst({
    where: and(eq(eventTasksTable.id, taskId), eq(eventTasksTable.eventId, eventId)),
  });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  // Delete only when all three IDs match — prevents cross-event/task IDOR
  const result = await db
    .delete(eventTaskSignupsTable)
    .where(
      and(
        eq(eventTaskSignupsTable.id, signupId),
        eq(eventTaskSignupsTable.eventTaskId, taskId),
        eq(eventTaskSignupsTable.eventId, eventId),
      )
    )
    .returning({ id: eventTaskSignupsTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "Signup not found" });
    return;
  }

  res.status(204).send();
});

// ─── VOLUNTEER TASK PACKS ─────────────────────────────────────────────────────

router.get("/volunteer-tasks/packs", requireCoachOrAdmin, async (req, res) => {
  const packs = await db.select().from(volunteerTaskPacksTable).orderBy(volunteerTaskPacksTable.createdAt);
  const packTaskRows = await db
    .select({ packId: volunteerTaskPackTasksTable.packId, task: volunteerTemplateTasksTable })
    .from(volunteerTaskPackTasksTable)
    .innerJoin(volunteerTemplateTasksTable, eq(volunteerTaskPackTasksTable.templateTaskId, volunteerTemplateTasksTable.id));
  const result = packs.map(pack => ({
    ...pack,
    tasks: packTaskRows.filter(r => r.packId === pack.id).map(r => r.task),
  }));
  res.json(result);
});

router.post("/volunteer-tasks/packs", requireCoachOrAdmin, async (req, res) => {
  const { name, description, templateTaskIds } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [pack] = await db.insert(volunteerTaskPacksTable).values({
    name,
    description: description ?? null,
  }).returning();
  if (Array.isArray(templateTaskIds) && templateTaskIds.length > 0) {
    await db.insert(volunteerTaskPackTasksTable).values(
      templateTaskIds.map((tid: number) => ({ packId: pack.id, templateTaskId: tid }))
    ).onConflictDoNothing();
  }
  res.status(201).json(pack);
});

router.put("/volunteer-tasks/packs/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { name, description } = req.body;
  const [updated] = await db.update(volunteerTaskPacksTable)
    .set({ ...(name && { name }), description: description ?? null })
    .where(eq(volunteerTaskPacksTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/volunteer-tasks/packs/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(volunteerTaskPacksTable).where(eq(volunteerTaskPacksTable.id, id));
  res.status(204).send();
});

router.post("/volunteer-tasks/packs/:id/tasks", requireCoachOrAdmin, async (req, res) => {
  const packId = parseInt(str(req.params.id));
  const { templateTaskId } = req.body;
  if (!templateTaskId) { res.status(400).json({ error: "templateTaskId required" }); return; }
  await db.insert(volunteerTaskPackTasksTable).values({ packId, templateTaskId }).onConflictDoNothing();
  res.status(201).json({ ok: true });
});

router.delete("/volunteer-tasks/packs/:packId/tasks/:templateTaskId", requireCoachOrAdmin, async (req, res) => {
  const packId = parseInt(str(req.params.packId));
  const templateTaskId = parseInt(str(req.params.templateTaskId));
  await db.delete(volunteerTaskPackTasksTable)
    .where(and(eq(volunteerTaskPackTasksTable.packId, packId), eq(volunteerTaskPackTasksTable.templateTaskId, templateTaskId)));
  res.status(204).send();
});

// POST /events/:id/tasks/clone-pack — clone all tasks from a pack onto an event
router.post("/events/:id/tasks/clone-pack", requireCoachOrAdmin, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { packId } = req.body;
  if (!packId) { res.status(400).json({ error: "packId required" }); return; }
  const packTasks = await db
    .select({ template: volunteerTemplateTasksTable })
    .from(volunteerTaskPackTasksTable)
    .innerJoin(volunteerTemplateTasksTable, eq(volunteerTaskPackTasksTable.templateTaskId, volunteerTemplateTasksTable.id))
    .where(eq(volunteerTaskPackTasksTable.packId, packId));
  if (packTasks.length === 0) {
    res.status(404).json({ error: "Pack not found or has no tasks" });
    return;
  }
  await db.insert(eventTasksTable).values(
    packTasks.map(pt => ({
      eventId,
      templateTaskId: pt.template.id,
      category: pt.template.category,
      title: pt.template.title,
      description: pt.template.description ?? null,
      slotsNeeded: pt.template.slotsDefault,
      sortOrder: pt.template.sortOrder,
    }))
  );
  res.status(201).json({ added: packTasks.length });
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
