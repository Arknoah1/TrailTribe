import { Router } from "express";
import { db } from "@workspace/db";
import {
  volunteerTemplateCategoriesTable,
  volunteerTemplateTasksTable,
  volunteerTaskPacksTable,
  volunteerTaskPackTasksTable,
  eventTasksTable,
  eventTaskSignupsTable,
  eventsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, count, gte, max } from "drizzle-orm";
import { requireAuth, requireApproved, requireAdmin, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

function normalizeCategoryName(value: unknown): { name: string; nameKey: string } | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) return null;
  return { name, nameKey: name.toLocaleLowerCase() };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

async function listTemplateTaskRows(taskIds?: number[]) {
  const selection = db
    .select({ task: volunteerTemplateTasksTable, category: volunteerTemplateCategoriesTable })
    .from(volunteerTemplateTasksTable)
    .innerJoin(
      volunteerTemplateCategoriesTable,
      eq(volunteerTemplateTasksTable.categoryId, volunteerTemplateCategoriesTable.id),
    );

  const rows = taskIds
    ? await selection
        .where(inArray(volunteerTemplateTasksTable.id, taskIds))
        .orderBy(
          volunteerTemplateCategoriesTable.sortOrder,
          volunteerTemplateTasksTable.sortOrder,
          volunteerTemplateTasksTable.id,
        )
    : await selection.orderBy(
        volunteerTemplateCategoriesTable.sortOrder,
        volunteerTemplateTasksTable.sortOrder,
        volunteerTemplateTasksTable.id,
      );

  return rows;
}

function serializeTemplateTask(row: Awaited<ReturnType<typeof listTemplateTaskRows>>[number]) {
  return {
    ...row.task,
    categoryId: row.category.id,
    category: row.category.name,
  };
}

async function nextTemplateTaskSortOrder(categoryId: number): Promise<number> {
  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: max(volunteerTemplateTasksTable.sortOrder) })
    .from(volunteerTemplateTasksTable)
    .where(eq(volunteerTemplateTasksTable.categoryId, categoryId));
  return Number(maxSortOrder ?? 0) + 10;
}

// ─── TEMPLATE CATEGORIES (coach/admin only) ─────────────────────────────────

router.get("/volunteer-tasks/categories", requireCoachOrAdmin, async (_req, res) => {
  const categories = await db
    .select()
    .from(volunteerTemplateCategoriesTable)
    .orderBy(volunteerTemplateCategoriesTable.sortOrder, volunteerTemplateCategoriesTable.id);
  res.json(categories);
});

router.post("/volunteer-tasks/categories", requireCoachOrAdmin, async (req, res) => {
  const parsed = normalizeCategoryName(req.body?.name);
  if (!parsed) {
    res.status(400).json({ error: "Category name is required and must be 120 characters or fewer" });
    return;
  }

  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: max(volunteerTemplateCategoriesTable.sortOrder) })
    .from(volunteerTemplateCategoriesTable);

  try {
    const [category] = await db
      .insert(volunteerTemplateCategoriesTable)
      .values({
        ...parsed,
        sortOrder: Number(maxSortOrder ?? 0) + 10,
      })
      .returning();
    res.status(201).json(category);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
});

router.patch("/volunteer-tasks/categories/reorder", requireCoachOrAdmin, async (req, res) => {
  const orderedIds = req.body?.orderedIds;
  if (
    !Array.isArray(orderedIds)
    || orderedIds.length === 0
    || orderedIds.some((id: unknown) => !Number.isInteger(id))
    || new Set(orderedIds).size !== orderedIds.length
  ) {
    res.status(400).json({ error: "orderedIds must be a list of unique category IDs" });
    return;
  }

  const categories = await db.select({ id: volunteerTemplateCategoriesTable.id }).from(volunteerTemplateCategoriesTable);
  const categoryIds = new Set(categories.map((category) => category.id));
  if (orderedIds.length !== categoryIds.size || orderedIds.some((id: number) => !categoryIds.has(id))) {
    res.status(400).json({ error: "orderedIds must include every category exactly once" });
    return;
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(volunteerTemplateCategoriesTable)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(volunteerTemplateCategoriesTable.id, id));
    }
  });
  res.json({ ok: true });
});

router.patch("/volunteer-tasks/categories/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const parsed = req.body?.name === undefined ? null : normalizeCategoryName(req.body.name);
  if (req.body?.name !== undefined && !parsed) {
    res.status(400).json({ error: "Category name is required and must be 120 characters or fewer" });
    return;
  }
  if (!parsed) {
    res.status(400).json({ error: "Category name is required" });
    return;
  }

  try {
    const [updated] = await db
      .update(volunteerTemplateCategoriesTable)
      .set(parsed)
      .where(eq(volunteerTemplateCategoriesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
});

router.delete("/volunteer-tasks/categories/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const [assignedTask] = await db
    .select({ id: volunteerTemplateTasksTable.id })
    .from(volunteerTemplateTasksTable)
    .where(eq(volunteerTemplateTasksTable.categoryId, id))
    .limit(1);
  if (assignedTask) {
    res.status(409).json({ error: "Reassign all tasks before deleting this category" });
    return;
  }

  const deleted = await db
    .delete(volunteerTemplateCategoriesTable)
    .where(eq(volunteerTemplateCategoriesTable.id, id))
    .returning({ id: volunteerTemplateCategoriesTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.status(204).send();
});

// ─── TEMPLATE TASKS (coach/admin only) ──────────────────────────────────────

router.get("/volunteer-tasks/templates", requireCoachOrAdmin, async (req, res) => {
  const templates = await listTemplateTaskRows();
  res.json(templates.map(serializeTemplateTask));
});

router.post("/volunteer-tasks/templates", requireCoachOrAdmin, async (req, res) => {
  const { categoryId, title, description, slotsDefault, sortOrder } = req.body ?? {};
  if (!Number.isInteger(categoryId) || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "categoryId and title are required" });
    return;
  }
  const category = await db.query.volunteerTemplateCategoriesTable.findFirst({
    where: eq(volunteerTemplateCategoriesTable.id, categoryId),
  });
  if (!category) {
    res.status(400).json({ error: "Unknown category" });
    return;
  }
  const [task] = await db.insert(volunteerTemplateTasksTable).values({
    categoryId,
    title: title.trim(),
    description: description ?? null,
    slotsDefault: slotsDefault ?? 1,
    sortOrder: sortOrder ?? await nextTemplateTaskSortOrder(categoryId),
  }).returning();
  res.status(201).json(serializeTemplateTask({ task, category }));
});

router.put("/volunteer-tasks/templates/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { categoryId, title, description, slotsDefault, sortOrder } = req.body ?? {};
  if (!Number.isInteger(categoryId) || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "categoryId and title are required" });
    return;
  }
  const category = await db.query.volunteerTemplateCategoriesTable.findFirst({
    where: eq(volunteerTemplateCategoriesTable.id, categoryId),
  });
  if (!category) {
    res.status(400).json({ error: "Unknown category" });
    return;
  }
  const existingTask = await db.query.volunteerTemplateTasksTable.findFirst({
    where: eq(volunteerTemplateTasksTable.id, id),
  });
  if (!existingTask) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const movedToAnotherCategory = existingTask.categoryId !== categoryId;
  const nextSortOrder = movedToAnotherCategory && sortOrder === undefined
    ? await nextTemplateTaskSortOrder(categoryId)
    : sortOrder;
  const [updated] = await db.update(volunteerTemplateTasksTable)
    .set({
      categoryId,
      title: title.trim(),
      description: description ?? null,
      ...(slotsDefault !== undefined && { slotsDefault }),
      ...(nextSortOrder !== undefined && { sortOrder: nextSortOrder }),
    })
    .where(eq(volunteerTemplateTasksTable.id, id))
    .returning();
  res.json(serializeTemplateTask({ task: updated, category }));
});

router.delete("/volunteer-tasks/templates/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(volunteerTemplateTasksTable).where(eq(volunteerTemplateTasksTable.id, id));
  res.status(204).send();
});

router.patch("/volunteer-tasks/templates/reorder", requireCoachOrAdmin, async (req, res) => {
  const { categoryId, orderedTaskIds } = req.body ?? {};
  if (
    !Number.isInteger(categoryId)
    || !Array.isArray(orderedTaskIds)
    || orderedTaskIds.length === 0
    || orderedTaskIds.some((id: unknown) => !Number.isInteger(id))
    || new Set(orderedTaskIds).size !== orderedTaskIds.length
  ) {
    res.status(400).json({ error: "categoryId and unique orderedTaskIds are required" });
    return;
  }

  const tasks = await db
    .select({ id: volunteerTemplateTasksTable.id })
    .from(volunteerTemplateTasksTable)
    .where(eq(volunteerTemplateTasksTable.categoryId, categoryId));
  const taskIds = new Set(tasks.map((task) => task.id));
  if (orderedTaskIds.length !== taskIds.size || orderedTaskIds.some((id: number) => !taskIds.has(id))) {
    res.status(400).json({ error: "orderedTaskIds must include every task in this category exactly once" });
    return;
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of orderedTaskIds.entries()) {
      await tx
        .update(volunteerTemplateTasksTable)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(volunteerTemplateTasksTable.id, id));
    }
  });
  res.json({ ok: true });
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

// ─── ONBOARDING OPPORTUNITIES ──────────────────────────────────────────────────
// Pending households may need to volunteer before their coach approves them. This
// deliberately returns only the event and task data needed to choose a role—not
// protected event details or other volunteers' identities.
router.get("/onboarding/volunteer-opportunities", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me?.householdId) {
    res.status(403).json({ error: "Finish family setup before viewing volunteer opportunities" });
    return;
  }

  const events = await db
    .select({
      id: eventsTable.id,
      title: eventsTable.title,
      startTime: eventsTable.startTime,
    })
    .from(eventsTable)
    .where(and(
      eq(eventsTable.volunteerTasksEnabled, true),
      eq(eventsTable.isArchived, false),
      gte(eventsTable.startTime, new Date()),
    ))
    .orderBy(eventsTable.startTime);

  if (events.length === 0) {
    res.json([]);
    return;
  }

  const eventIds = events.map((event) => event.id);
  const tasks = await db
    .select()
    .from(eventTasksTable)
    .where(inArray(eventTasksTable.eventId, eventIds))
    .orderBy(eventTasksTable.sortOrder, eventTasksTable.category, eventTasksTable.title);

  if (tasks.length === 0) {
    res.json(events.map((event) => ({ ...event, tasks: [] })));
    return;
  }

  const taskIds = tasks.map((task) => task.id);
  const [signupCounts, mySignups] = await Promise.all([
    db
      .select({ eventTaskId: eventTaskSignupsTable.eventTaskId, signupCount: count() })
      .from(eventTaskSignupsTable)
      .where(inArray(eventTaskSignupsTable.eventTaskId, taskIds))
      .groupBy(eventTaskSignupsTable.eventTaskId),
    db
      .select({ eventTaskId: eventTaskSignupsTable.eventTaskId })
      .from(eventTaskSignupsTable)
      .where(and(
        inArray(eventTaskSignupsTable.eventTaskId, taskIds),
        eq(eventTaskSignupsTable.userId, me.id),
      )),
  ]);
  const signupCountByTaskId = new Map(signupCounts.map((row) => [row.eventTaskId, Number(row.signupCount)]));
  const myTaskIds = new Set(mySignups.map((signup) => signup.eventTaskId));

  res.json(events.map((event) => ({
    ...event,
    tasks: tasks
      .filter((task) => task.eventId === event.id)
      .map((task) => ({
        id: task.id,
        category: task.category,
        title: task.title,
        description: task.description,
        slotsNeeded: task.slotsNeeded,
        signupCount: signupCountByTaskId.get(task.id) ?? 0,
        mySignup: myTaskIds.has(task.id),
      })),
  })));
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

router.get("/events/:id/tasks", requireApproved, async (req, res) => {
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

  const templates = await listTemplateTaskRows(
    templateTaskIds && templateTaskIds.length > 0 ? templateTaskIds : undefined,
  );

  if (templates.length === 0) {
    res.status(404).json({ error: "No templates found" });
    return;
  }

  await db.insert(eventTasksTable).values(
    templates.map(({ task, category }) => ({
      eventId,
      templateTaskId: task.id,
      category: category.name,
      title: task.title,
      description: task.description ?? null,
      slotsNeeded: task.slotsDefault,
      sortOrder: task.sortOrder,
    }))
  );

  res.status(201).json({ added: templates.length });
});

// Bulk signup: sign the current user up for multiple tasks; skip silently if already signed up or at capacity
router.post("/events/:id/tasks/bulk-signup", requireApproved, async (req, res) => {
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

router.post("/events/:id/tasks/:taskId/signup", requireApproved, async (req, res) => {
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

router.delete("/events/:id/tasks/:taskId/signup", requireApproved, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const taskId = parseInt(str(req.params.taskId));
  const clerkUserId = (req as any).clerkUserId;

  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  await db.delete(eventTaskSignupsTable).where(
    and(
      eq(eventTaskSignupsTable.eventId, eventId),
      eq(eventTaskSignupsTable.eventTaskId, taskId),
      eq(eventTaskSignupsTable.userId, me.id),
    )
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
    .select({
      packId: volunteerTaskPackTasksTable.packId,
      task: volunteerTemplateTasksTable,
      category: volunteerTemplateCategoriesTable,
    })
    .from(volunteerTaskPackTasksTable)
    .innerJoin(volunteerTemplateTasksTable, eq(volunteerTaskPackTasksTable.templateTaskId, volunteerTemplateTasksTable.id))
    .innerJoin(
      volunteerTemplateCategoriesTable,
      eq(volunteerTemplateTasksTable.categoryId, volunteerTemplateCategoriesTable.id),
    );
  const result = packs.map(pack => ({
    ...pack,
    tasks: packTaskRows
      .filter(r => r.packId === pack.id)
      .sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.task.sortOrder - b.task.sortOrder)
      .map(r => serializeTemplateTask(r)),
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
    .select({
      template: volunteerTemplateTasksTable,
      category: volunteerTemplateCategoriesTable,
    })
    .from(volunteerTaskPackTasksTable)
    .innerJoin(volunteerTemplateTasksTable, eq(volunteerTaskPackTasksTable.templateTaskId, volunteerTemplateTasksTable.id))
    .innerJoin(
      volunteerTemplateCategoriesTable,
      eq(volunteerTemplateTasksTable.categoryId, volunteerTemplateCategoriesTable.id),
    )
    .where(eq(volunteerTaskPackTasksTable.packId, packId));
  if (packTasks.length === 0) {
    res.status(404).json({ error: "Pack not found or has no tasks" });
    return;
  }
  await db.insert(eventTasksTable).values(
    packTasks
      .sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.template.sortOrder - b.template.sortOrder)
      .map(pt => ({
      eventId,
      templateTaskId: pt.template.id,
      category: pt.category.name,
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
