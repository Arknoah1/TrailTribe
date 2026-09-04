import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  householdsTable,
  podsTable,
  eventsTable,
  eventRsvpsTable,
  eventTaskSignupsTable,
  carpoolOffersTable,
  carpoolClaimsTable,
  eventAttachmentsTable,
  trailheadsTable,
} from "@workspace/db";
import { eq, gte, lte, and, isNull, inArray } from "drizzle-orm";
import { requireApproved } from "../middlewares/requireAuth";
import { emailHealthy } from "../lib/email";

const router = Router();

router.get("/dashboard/summary", requireApproved, async (req, res) => {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allUsers = await db.select().from(usersTable);
  const coaches = allUsers.filter((u) => u.role === "coach" || u.role === "admin");
  // Only count active (non-archived) households and their members.
  const households = await db.select().from(householdsTable).where(isNull(householdsTable.archivedAt));
  const activeHouseholdIds = new Set(households.map((h) => h.id));
  const students = allUsers.filter((u) =>
    u.role === "student" &&
    u.seasonParticipationStatus !== "season_off" &&
    u.seasonParticipationStatus !== "pending" &&
    u.householdId != null &&
    activeHouseholdIds.has(u.householdId)
  );
  const pods = await db.select().from(podsTable).where(eq(podsTable.isActive, true));
  // Pending approvals: only users from active households (coaches/admins have no householdId so always include them).
  const pendingApprovals = allUsers.filter((u) => !u.podId && (u.householdId == null || activeHouseholdIds.has(u.householdId)));

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
  const me = clerkUserId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) })
    : undefined;

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
      if (me) {
        const myRsvpRow = rsvps.find((r) => r.userId === me.id);
        myRsvp = myRsvpRow?.status ?? null;
      }
      const volunteerSignups = await db.select().from(eventTaskSignupsTable).where(eq(eventTaskSignupsTable.eventId, event.id));
      const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));
      const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
      let carpoolSpotsAvailable = 0;
      if (offers.length > 0) {
        const offerIds = offers.map((o) => o.id);
        const allClaims = await db.select().from(carpoolClaimsTable).where(inArray(carpoolClaimsTable.carpoolOfferId, offerIds));
        for (const offer of offers) {
          const seatsClaimed = allClaims.filter((c) => c.carpoolOfferId === offer.id && c.needsSeat).length;
          carpoolSpotsAvailable += Math.max(0, offer.availableSeats - seatsClaimed);
        }
      }
      return {
        ...event,
        trailhead: trailhead ?? null,
        rsvpCounts,
        myRsvp,
        volunteerCount: volunteerSignups.length,
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
    emailConfigured: emailHealthy,
  });
});

router.get("/dashboard/upcoming-events", requireApproved, async (req, res) => {
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const clerkUserId = (req as any).clerkUserId;

  const events = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startTime, now), lte(eventsTable.startTime, twoWeeksOut), eq(eventsTable.isArchived, false)))
    .orderBy(eventsTable.startTime);

  // Resolve caller once, outside the per-event loop
  let me: typeof usersTable.$inferSelect | undefined;
  let householdMembers: typeof usersTable.$inferSelect[] = [];
  if (clerkUserId) {
    me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
    if (me?.role === "parent" && me.householdId) {
      householdMembers = (await db.select().from(usersTable).where(eq(usersTable.householdId, me.householdId)))
        .filter((member) => member.role !== "student" || member.seasonParticipationStatus === "active");
    }
  }

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
      let householdRsvps: Array<{ userId: number; firstName: string; isMe: boolean; status: string | null }> | null = null;

      if (me) {
        const myRsvpRow = rsvps.find((r) => r.userId === me!.id);
        myRsvp = myRsvpRow?.status ?? null;

        if (me.role === "parent" && householdMembers.length > 0) {
          householdRsvps = householdMembers.map((member) => {
            const rsvpRow = rsvps.find((r) => r.userId === member.id);
            return {
              userId: member.id,
              firstName: member.firstName,
              isMe: member.id === me!.id,
              status: rsvpRow?.status ?? null,
            };
          });
        }
      }

      const volunteerSignups = await db.select().from(eventTaskSignupsTable).where(eq(eventTaskSignupsTable.eventId, event.id));
      const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));
      const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
      let carpoolSpotsAvailable = 0;
      if (offers.length > 0) {
        const offerIds = offers.map((o) => o.id);
        const allClaims = await db.select().from(carpoolClaimsTable).where(inArray(carpoolClaimsTable.carpoolOfferId, offerIds));
        for (const offer of offers) {
          const seatsClaimed = allClaims.filter((c) => c.carpoolOfferId === offer.id && c.needsSeat).length;
          carpoolSpotsAvailable += Math.max(0, offer.availableSeats - seatsClaimed);
        }
      }
      return {
        ...event,
        trailhead: trailhead ?? null,
        rsvpCounts,
        myRsvp,
        householdRsvps,
        volunteerCount: volunteerSignups.length,
        carpoolSpotsAvailable,
        attachments,
      };
    })
  );

  res.json(result);
});

// GET /dashboard/carpool-events — upcoming events within 60 days for the carpool hub.
// Uses a wider window than /upcoming-events (14 days) so carpools planned in advance appear.
router.get("/dashboard/carpool-events", requireApproved, async (req, res) => {
  const now = new Date();
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const clerkUserId = (req as any).clerkUserId;

  const events = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startTime, now), lte(eventsTable.startTime, sixtyDaysOut), eq(eventsTable.isArchived, false)))
    .orderBy(eventsTable.startTime);

  let me: typeof usersTable.$inferSelect | undefined;
  let householdMembers: typeof usersTable.$inferSelect[] = [];
  if (clerkUserId) {
    me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
    if (me?.role === "parent" && me.householdId) {
      householdMembers = (await db.select().from(usersTable).where(eq(usersTable.householdId, me.householdId)))
        .filter((member) => member.role !== "student" || member.seasonParticipationStatus === "active");
    }
  }

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
      let householdRsvps: Array<{ userId: number; firstName: string; isMe: boolean; status: string | null }> | null = null;

      if (me) {
        const myRsvpRow = rsvps.find((r) => r.userId === me!.id);
        myRsvp = myRsvpRow?.status ?? null;

        if (me.role === "parent" && householdMembers.length > 0) {
          householdRsvps = householdMembers.map((member) => {
            const rsvpRow = rsvps.find((r) => r.userId === member.id);
            return {
              userId: member.id,
              firstName: member.firstName,
              isMe: member.id === me!.id,
              status: rsvpRow?.status ?? null,
            };
          });
        }
      }

      const volunteerSignups = await db.select().from(eventTaskSignupsTable).where(eq(eventTaskSignupsTable.eventId, event.id));
      const attachments = await db.select().from(eventAttachmentsTable).where(eq(eventAttachmentsTable.eventId, event.id));
      const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, event.id));
      let carpoolSpotsAvailable = 0;
      if (offers.length > 0) {
        const offerIds = offers.map((o) => o.id);
        const allClaims = await db.select().from(carpoolClaimsTable).where(inArray(carpoolClaimsTable.carpoolOfferId, offerIds));
        for (const offer of offers) {
          const seatsClaimed = allClaims.filter((c) => c.carpoolOfferId === offer.id && c.needsSeat).length;
          carpoolSpotsAvailable += Math.max(0, offer.availableSeats - seatsClaimed);
        }
      }
      return {
        ...event,
        trailhead: trailhead ?? null,
        rsvpCounts,
        myRsvp,
        householdRsvps,
        volunteerCount: volunteerSignups.length,
        carpoolSpotsAvailable,
        attachments,
      };
    })
  );

  res.json(result);
});

export default router;
