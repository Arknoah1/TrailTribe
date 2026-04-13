import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  householdsTable,
  podsTable,
  eventsTable,
  eventRsvpsTable,
  volunteerSignupsTable,
  carpoolOffersTable,
  carpoolClaimsTable,
  eventAttachmentsTable,
  trailheadsTable,
} from "@workspace/db";
import { eq, gte, lte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allUsers = await db.select().from(usersTable);
  const students = allUsers.filter((u) => u.role === "student");
  const coaches = allUsers.filter((u) => u.role === "coach" || u.role === "admin");
  const households = await db.select().from(householdsTable);
  const pods = await db.select().from(podsTable).where(eq(podsTable.isActive, true));
  const pendingApprovals = allUsers.filter((u) => !u.podId);

  const liabilityCount = households.filter((h) => h.liabilityWaiverSigned).length;
  const mediaCount = households.filter((h) => h.mediaReleaseSigned).length;
  const conductCount = households.filter((h) => h.codeOfConductSigned).length;
  const fullyCompliant = households.filter(
    (h) => h.liabilityWaiverSigned && h.mediaReleaseSigned && h.codeOfConductSigned
  ).length;

  const thisWeekEvents = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startTime, now), lte(eventsTable.startTime, weekEnd), eq(eventsTable.isArchived, false)))
    .orderBy(eventsTable.startTime);

  const clerkUserId = (req as any).clerkUserId;
  const eventsWithDetails = await Promise.all(
    thisWeekEvents.map(async (event) => {
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
      const volunteers = await db.select().from(volunteerSignupsTable).where(eq(volunteerSignupsTable.eventId, event.id));
      const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));
      const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
      let carpoolSpotsAvailable = 0;
      for (const offer of offers) {
        const claims = await db.select().from(carpoolClaimsTable).where(eq(carpoolClaimsTable.carpoolOfferId, offer.id));
        const seatsClaimed = claims.filter((c) => c.needsSeat).length;
        carpoolSpotsAvailable += Math.max(0, offer.availableSeats - seatsClaimed);
      }
      return {
        ...event,
        trailhead: trailhead ?? null,
        rsvpCounts,
        myRsvp,
        volunteerCount: volunteers.length,
        carpoolSpotsAvailable,
        attachments,
      };
    })
  );

  const upcomingAll = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startTime, now), eq(eventsTable.isArchived, false)));

  res.json({
    totalStudents: students.length,
    totalFamilies: households.length,
    totalCoaches: coaches.length,
    activePods: pods.length,
    pendingApprovals: pendingApprovals.length,
    complianceStats: {
      liabilityWaiverRate: households.length > 0 ? (liabilityCount / households.length) * 100 : 0,
      mediaReleaseRate: households.length > 0 ? (mediaCount / households.length) * 100 : 0,
      codeOfConductRate: households.length > 0 ? (conductCount / households.length) * 100 : 0,
      fullyCompliantCount: fullyCompliant,
      totalHouseholds: households.length,
    },
    upcomingEventCount: upcomingAll.length,
    thisWeekEvents: eventsWithDetails,
  });
});

router.get("/dashboard/upcoming-events", requireAuth, async (req, res) => {
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const clerkUserId = (req as any).clerkUserId;

  const events = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startTime, now), lte(eventsTable.startTime, twoWeeksOut), eq(eventsTable.isArchived, false)))
    .orderBy(eventsTable.startTime);

  const result = await Promise.all(
    events.map(async (event) => {
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
      const volunteers = await db.select().from(volunteerSignupsTable).where(eq(volunteerSignupsTable.eventId, event.id));
      const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));
      const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
      let carpoolSpotsAvailable = 0;
      for (const offer of offers) {
        const claims = await db.select().from(carpoolClaimsTable).where(eq(carpoolClaimsTable.carpoolOfferId, offer.id));
        carpoolSpotsAvailable += Math.max(0, offer.availableSeats - claims.filter((c) => c.needsSeat).length);
      }
      return {
        ...event,
        trailhead: trailhead ?? null,
        rsvpCounts,
        myRsvp,
        volunteerCount: volunteers.length,
        carpoolSpotsAvailable,
        attachments,
      };
    })
  );

  res.json(result);
});

export default router;
