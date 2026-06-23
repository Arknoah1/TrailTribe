import { Router } from "express";
import { db } from "@workspace/db";
import {
  eventsTable,
  eventRsvpsTable,
  volunteerSignupsTable,
  eventTasksTable,
  eventTaskSignupsTable,
  trailheadsTable,
  eventAttachmentsTable,
  usersTable,
  carpoolOffersTable,
  carpoolClaimsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { randomUUID } from "crypto";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

async function buildEventWithDetails(event: any, clerkUserId?: string) {
  const trailhead = event.trailheadId
    ? await db.query.trailheadsTable.findFirst({ where: eq(trailheadsTable.id, event.trailheadId) })
    : null;

  const rsvps = await db.select().from(eventRsvpsTable).where(eq(eventRsvpsTable.eventId, event.id));
  const rsvpCounts = {
    attending: rsvps.filter((r) => r.status === "attending").length,
    notAttending: rsvps.filter((r) => r.status === "not_attending").length,
    maybe: rsvps.filter((r) => r.status === "maybe").length,
  };

  let myRsvp: string | null = null;
  if (clerkUserId) {
    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
    if (me) {
      const myRsvpRow = rsvps.find((r) => r.userId === me.id);
      myRsvp = myRsvpRow?.status ?? null;
    }
  }

  const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));

  const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
  let carpoolSpotsAvailable = 0;
  for (const offer of offers) {
    const claims = await db.select().from(carpoolClaimsTable).where(eq(carpoolClaimsTable.carpoolOfferId, offer.id));
    const seatsClaimed = claims.filter((c) => c.needsSeat).length;
    carpoolSpotsAvailable += Math.max(0, offer.availableSeats - seatsClaimed);
  }

  // Count unique volunteers signed up for tasks (new system)
  const eventTasks = await db.select({ id: eventTasksTable.id }).from(eventTasksTable).where(eq(eventTasksTable.eventId, event.id));
  let volunteerCount = 0;
  if (eventTasks.length > 0) {
    const taskIds = eventTasks.map((t) => t.id);
    const taskSignups = await db.select().from(eventTaskSignupsTable).where(inArray(eventTaskSignupsTable.eventTaskId, taskIds));
    const uniqueUserIds = new Set(taskSignups.map((s) => s.userId));
    volunteerCount = uniqueUserIds.size;
  }

  return {
    ...event,
    trailhead: trailhead ?? null,
    rsvpCounts,
    myRsvp,
    volunteerCount,
    carpoolSpotsAvailable,
    attachments,
  };
}

router.post("/events/batch", requireCoachOrAdmin, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { events, seriesId } = req.body as { events: any[]; seriesId?: string };
  if (!Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: "events array required" });
    return;
  }
  const resolvedSeriesId = seriesId || randomUUID();
  const created = await db.transaction(async (tx) => {
    return tx.insert(eventsTable).values(
      events.map((e: any) => ({
        title: e.title,
        description: e.description ?? null,
        eventType: e.eventType ?? "practice",
        startTime: new Date(e.startTime),
        endTime: e.endTime ? new Date(e.endTime) : null,
        trailheadId: e.trailheadId ?? null,
        locationOverride: e.locationOverride ?? null,
        googleMapsUrlOverride: e.googleMapsUrlOverride ?? null,
        podIds: e.podIds ?? null,
        isAllTeam: e.isAllTeam ?? true,
        rsvpDeadline: e.rsvpDeadline ? new Date(e.rsvpDeadline) : null,
        volunteerSlotsNeeded: e.volunteerSlotsNeeded ?? 0,
        createdByUserId: me?.id ?? null,
        iCalUid: randomUUID(),
        seriesId: resolvedSeriesId,
      }))
    ).returning();
  });
  res.status(201).json({ created: created.length, ids: created.map(e => e.id) });
});

router.delete("/series/:seriesId", requireCoachOrAdmin, async (req, res) => {
  const sid = str(req.params.seriesId);
  const fromDate = (req.query as any).fromDate;
  const cutoff = fromDate ? new Date(fromDate) : new Date();
  const toDelete = await db.select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.seriesId, sid), gte(eventsTable.startTime, cutoff)));
  if (toDelete.length > 0) {
    await db.delete(eventsTable).where(inArray(eventsTable.id, toDelete.map(r => r.id)));
  }
  res.json({ deleted: toDelete.length });
});

router.patch("/series/:seriesId/reschedule", requireCoachOrAdmin, async (req, res) => {
  const sid = str(req.params.seriesId);
  const { shiftDays, fromDate } = req.body as { shiftDays: number; fromDate?: string };
  if (typeof shiftDays !== "number" || shiftDays === 0) {
    res.status(400).json({ error: "shiftDays must be a non-zero integer" });
    return;
  }
  const cutoff = fromDate ? new Date(fromDate) : new Date();
  const toShift = await db.select().from(eventsTable)
    .where(and(eq(eventsTable.seriesId, sid), gte(eventsTable.startTime, cutoff)));
  const shiftMs = shiftDays * 86_400_000;
  await Promise.all(
    toShift.map((e) =>
      db.update(eventsTable).set({
        startTime: new Date(e.startTime.getTime() + shiftMs),
        endTime: e.endTime ? new Date(e.endTime.getTime() + shiftMs) : null,
      }).where(eq(eventsTable.id, e.id))
    )
  );
  res.json({ rescheduled: toShift.length });
});

router.get("/events", requireAuth, async (req, res) => {
  const { startDate, endDate, eventType, podId, archived } = req.query as Record<string, string>;
  const clerkUserId = (req as any).clerkUserId;
  const conditions: any[] = [];
  if (startDate) conditions.push(gte(eventsTable.startTime, new Date(startDate)));
  if (endDate) conditions.push(lte(eventsTable.startTime, new Date(endDate)));
  if (eventType) conditions.push(eq(eventsTable.eventType, eventType as any));
  if (archived !== "true") conditions.push(eq(eventsTable.isArchived, false));

  const events = conditions.length > 0
    ? await db.select().from(eventsTable).where(and(...conditions)).orderBy(eventsTable.startTime)
    : await db.select().from(eventsTable).where(eq(eventsTable.isArchived, false)).orderBy(eventsTable.startTime);

  const result = await Promise.all(events.map((e) => buildEventWithDetails(e, clerkUserId)));
  res.json(result);
});

router.post("/events", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const {
    title, description, eventType, startTime, endTime, trailheadId, locationOverride,
    googleMapsUrlOverride, podIds, isAllTeam, rsvpDeadline, volunteerSlotsNeeded
  } = req.body;

  const [event] = await db.insert(eventsTable).values({
    title,
    description: description ?? null,
    eventType: eventType ?? "practice",
    startTime: new Date(startTime),
    endTime: endTime ? new Date(endTime) : null,
    trailheadId: trailheadId ?? null,
    locationOverride: locationOverride ?? null,
    googleMapsUrlOverride: googleMapsUrlOverride ?? null,
    podIds: podIds ?? null,
    isAllTeam: isAllTeam ?? false,
    rsvpDeadline: rsvpDeadline ? new Date(rsvpDeadline) : null,
    volunteerSlotsNeeded: volunteerSlotsNeeded ?? 0,
    createdByUserId: me?.id ?? null,
    iCalUid: randomUUID(),
  }).returning();

  const result = await buildEventWithDetails(event, clerkUserId);
  res.status(201).json(result);
});

router.get("/events/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, id) });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const result = await buildEventWithDetails(event, clerkUserId);
  res.json(result);
});

router.patch("/events/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const {
    title, description, eventType, startTime, endTime, trailheadId,
    locationOverride, podIds, isAllTeam, rsvpDeadline, volunteerSlotsNeeded, isArchived, seriesId
  } = req.body;
  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (eventType !== undefined) updates.eventType = eventType;
  if (startTime !== undefined) updates.startTime = new Date(startTime);
  if (endTime !== undefined) updates.endTime = new Date(endTime);
  if (trailheadId !== undefined) updates.trailheadId = trailheadId;
  if (locationOverride !== undefined) updates.locationOverride = locationOverride;
  if (podIds !== undefined) updates.podIds = podIds;
  if (isAllTeam !== undefined) updates.isAllTeam = isAllTeam;
  if (rsvpDeadline !== undefined) updates.rsvpDeadline = new Date(rsvpDeadline);
  if (volunteerSlotsNeeded !== undefined) updates.volunteerSlotsNeeded = volunteerSlotsNeeded;
  if (isArchived !== undefined) updates.isArchived = isArchived;
  if (seriesId !== undefined) updates.seriesId = seriesId;

  const [event] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, id)).returning();
  const result = await buildEventWithDetails(event, clerkUserId);
  res.json(result);
});

router.delete("/events/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.status(204).send();
});

router.post("/events/:id/rsvp", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { status, userIds } = req.body;
  const targetIds: number[] = userIds?.length ? userIds : [me.id];
  const now = new Date();

  let lastRsvp: any = null;
  for (const userId of targetIds) {
    const existing = await db.query.eventRsvpsTable.findFirst({
      where: and(eq(eventRsvpsTable.eventId, eventId), eq(eventRsvpsTable.userId, userId)),
    });
    if (existing) {
      const [updated] = await db.update(eventRsvpsTable)
        .set({ status, respondedAt: now })
        .where(eq(eventRsvpsTable.id, existing.id))
        .returning();
      lastRsvp = updated;
    } else {
      const [created] = await db.insert(eventRsvpsTable).values({ eventId, userId, status, respondedAt: now }).returning();
      lastRsvp = created;
    }
  }

  if (status === "attending" && me.emailNotifications) {
    (async () => {
      try {
        const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, eventId) });
        if (!event) return;
        const trailhead = event.trailheadId
          ? await db.query.trailheadsTable.findFirst({ where: eq(trailheadsTable.id, event.trailheadId) })
          : null;
        const locationLine = event.locationOverride ?? trailhead?.name ?? "Location TBD";
        const dateStr = event.startTime.toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        });
        await sendEmail({
          to: me.email,
          subject: `You're set for ${event.title}`,
          text: [
            `Hi ${me.firstName},`,
            ``,
            `You're confirmed for:`,
            ``,
            `  ${event.title}`,
            `  ${dateStr}`,
            `  ${locationLine}`,
            ``,
            `See you on the trail!`,
            `— TrailTribe`,
          ].join("\n"),
        });
      } catch (err) {
        logger.error({ err }, "[events] rsvp confirmation email error");
      }
    })();
  }

  res.json(lastRsvp);
});

router.get("/events/:id/rsvps", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const rsvps = await db.select().from(eventRsvpsTable).where(eq(eventRsvpsTable.eventId, eventId));
  const result = await Promise.all(
    rsvps.map(async (r) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, r.userId) });
      return { ...r, user };
    })
  );
  res.json(result);
});

router.get("/events/:id/volunteers", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const volunteers = await db.select().from(volunteerSignupsTable).where(eq(volunteerSignupsTable.eventId, eventId));
  const result = await Promise.all(
    volunteers.map(async (v) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, v.userId) });
      return { ...v, user };
    })
  );
  res.json(result);
});

router.post("/events/:id/volunteers", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { role, notes } = req.body;
  const [signup] = await db.insert(volunteerSignupsTable).values({
    eventId,
    userId: me.id,
    role: role ?? null,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(signup);
});

router.delete("/events/:id/volunteers/:volunteerId", requireAuth, async (req, res) => {
  const volunteerId = parseInt(str(req.params.volunteerId));
  await db.delete(volunteerSignupsTable).where(eq(volunteerSignupsTable.id, volunteerId));
  res.status(204).send();
});

router.post("/events/:id/attachments", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const { label, objectPath, mimeType } = req.body;
  const [attachment] = await db.insert(eventAttachmentsTable).values({
    eventId,
    label,
    objectPath,
    mimeType: mimeType ?? null,
  }).returning();
  res.status(201).json(attachment);
});

export default router;
