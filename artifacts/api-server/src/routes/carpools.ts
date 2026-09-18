import { Router } from "express";
import { db } from "@workspace/db";
import {
  carpoolOffersTable,
  carpoolClaimsTable,
  carpoolRequestsTable,
  usersTable,
  eventsTable,
} from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { getShortNamePrefix } from "./settings";
import { addEmailLinks, createEmailLink } from "../lib/emailLinks";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;
const CLAIM_CONFLICT_MESSAGE = "This rider already has a driver for this event";
const CARPOOL_CAPACITY_LOCK_NAMESPACE = 410;
const CARPOOL_REQUEST_LOCK_NAMESPACE = 411;

type CapacityConflictCode = "NO_SEATS" | "NO_BIKE_TRAYS" | "OFFER_OVER_CAPACITY";

class CapacityConflict extends Error {
  constructor(
    readonly code: CapacityConflictCode,
    message: string,
    readonly riderOnlyAvailable = false,
  ) {
    super(message);
  }
}

function isCapacityConflict(err: unknown): err is CapacityConflict {
  return err instanceof CapacityConflict;
}

function sendCapacityConflict(res: any, err: CapacityConflict) {
  res.status(409).json({
    error: err.message,
    code: err.code,
    riderOnlyAvailable: err.riderOnlyAvailable,
  });
}

function isUniqueViolation(err: unknown): boolean {
  let current = err;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    seen.add(current);
    current = "cause" in current ? (current as { cause?: unknown }).cause : null;
  }
  return false;
}

async function buildOfferWithClaims(offer: any) {
  const driver = await db.query.usersTable.findFirst({ where: eq(usersTable.id, offer.driverUserId) });
  const claims = await db.select().from(carpoolClaimsTable).where(eq(carpoolClaimsTable.carpoolOfferId, offer.id));
  const claimsWithUsers = await Promise.all(
    claims.map(async (c) => {
      const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, c.riderUserId) });
      return { ...c, rider };
    })
  );
  const seatsClaimed = claims.filter((c) => c.needsSeat).length;
  const bikeTraysClaimed = claims.filter((c) => c.needsBikeTray).length;
  const seatsOverCapacity = Math.max(0, seatsClaimed - offer.availableSeats);
  const bikeTraysOverCapacity = Math.max(0, bikeTraysClaimed - offer.bikeTrayCount);
  return {
    ...offer,
    driver,
    claims: claimsWithUsers,
    seatsClaimed,
    bikeTraysClaimed,
    seatsRemaining: Math.max(0, offer.availableSeats - seatsClaimed),
    bikeTraysRemaining: Math.max(0, offer.bikeTrayCount - bikeTraysClaimed),
    seatsOverCapacity,
    bikeTraysOverCapacity,
    isOverCapacity: seatsOverCapacity > 0 || bikeTraysOverCapacity > 0,
  };
}

async function lockOffer(tx: any, offerId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CARPOOL_CAPACITY_LOCK_NAMESPACE}, ${offerId})`);
}

async function lockRequest(tx: any, requestId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CARPOOL_REQUEST_LOCK_NAMESPACE}, ${requestId})`);
}

function isValidCapacity(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

async function getOfferCapacity(tx: any, offerId: number) {
  const [offer] = await tx
    .select()
    .from(carpoolOffersTable)
    .where(eq(carpoolOffersTable.id, offerId))
    .limit(1);
  if (!offer) return null;

  const claims = await tx
    .select()
    .from(carpoolClaimsTable)
    .where(eq(carpoolClaimsTable.carpoolOfferId, offerId));
  const seatsClaimed = claims.filter((claim: any) => claim.needsSeat).length;
  const bikeTraysClaimed = claims.filter((claim: any) => claim.needsBikeTray).length;

  return {
    offer,
    claims,
    seatsClaimed,
    bikeTraysClaimed,
    isOverCapacity:
      seatsClaimed > offer.availableSeats ||
      bikeTraysClaimed > offer.bikeTrayCount,
  };
}

function assertCapacityForNewClaim(
  capacity: NonNullable<Awaited<ReturnType<typeof getOfferCapacity>>>,
  needsSeat: boolean,
  needsBikeTray: boolean,
) {
  if (capacity.isOverCapacity) {
    throw new CapacityConflict(
      "OFFER_OVER_CAPACITY",
      "This offer is already over capacity. The driver must increase capacity or remove a claim before adding another rider.",
    );
  }
  const seatAvailable = capacity.seatsClaimed < capacity.offer.availableSeats;
  if (needsSeat && !seatAvailable) {
    throw new CapacityConflict("NO_SEATS", "This carpool no longer has an available seat.");
  }
  if (needsBikeTray && capacity.bikeTraysClaimed >= capacity.offer.bikeTrayCount) {
    throw new CapacityConflict(
      "NO_BIKE_TRAYS",
      "This carpool no longer has an available bike tray.",
      seatAvailable,
    );
  }
}

async function getRequester(req: any) {
  const clerkUserId = req.clerkUserId;
  if (!clerkUserId) return null;
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

// A claim can be managed by: the rider themself, a parent in the rider's
// household, the driver of the offer the claim is on, or a coach/admin.
async function canManageClaim(requester: typeof usersTable.$inferSelect, claim: typeof carpoolClaimsTable.$inferSelect): Promise<boolean> {
  if (requester.role === "coach" || requester.role === "super_admin") return true;
  if (claim.riderUserId === requester.id) return true;
  // Only parents (not students) may manage claims on behalf of riders in their household.
  if (requester.role === "parent" && requester.householdId != null) {
    const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, claim.riderUserId) });
    if (rider && rider.householdId === requester.householdId) return true;
  }
  const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, claim.carpoolOfferId) });
  if (offer && offer.driverUserId === requester.id) return true;
  return false;
}

router.get("/events/:id/carpools", requireApproved, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, eventId));
  const result = await Promise.all(offers.map(buildOfferWithClaims));
  res.json(result);
});

router.post("/events/:id/carpools", requireApproved, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { availableSeats, bikeTrayCount, departureLocation, departureTime, notes } = req.body;
  if (!isValidCapacity(availableSeats) || !isValidCapacity(bikeTrayCount)) {
    res.status(400).json({ error: "Seats and bike trays must be non-negative whole numbers" });
    return;
  }
  const [offer] = await db.insert(carpoolOffersTable).values({
    eventId,
    driverUserId: me.id,
    availableSeats,
    bikeTrayCount,
    departureLocation: departureLocation ?? null,
    departureTime: departureTime ? new Date(departureTime) : null,
    notes: notes ?? null,
  }).returning();

  (async () => {
    try {
      const openRequests = await db
        .select()
        .from(carpoolRequestsTable)
        .where(and(eq(carpoolRequestsTable.eventId, eventId), eq(carpoolRequestsTable.status, "open")));
      const driverName = `${me.firstName} ${me.lastName}`;
      for (const req of openRequests) {
        if (req.requestedByUserId !== me.id) {
          await createNotification(
            req.requestedByUserId,
            "carpool_offer_posted",
            "New Carpool Offer",
            `${driverName} posted an offer with ${availableSeats} seat${availableSeats !== 1 ? "s" : ""} available.`,
            `/carpools/${eventId}`
          );
        }
      }
    } catch (err) {
      console.error("[notifications] offer trigger failed:", err);
    }
  })();

  res.status(201).json(offer);
});

router.patch("/carpools/:offerId", requireApproved, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  const isCoachOrAdmin = requester.role === "coach" || requester.role === "super_admin";
  if (!isCoachOrAdmin && offer.driverUserId !== requester.id) {
    res.status(403).json({ error: "You can only edit your own carpool offer" });
    return;
  }
  const { availableSeats, bikeTrayCount, departureLocation, departureTime, notes } = req.body;
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      await lockOffer(tx, offerId);
      const capacity = await getOfferCapacity(tx, offerId);
      if (!capacity) throw new Error("OFFER_NOT_FOUND");

      const nextSeats = availableSeats ?? capacity.offer.availableSeats;
      const nextTrays = bikeTrayCount ?? capacity.offer.bikeTrayCount;
      if (!Number.isInteger(nextSeats) || nextSeats < 0 || !Number.isInteger(nextTrays) || nextTrays < 0) {
        throw new Error("INVALID_CAPACITY");
      }
      if (nextSeats < capacity.seatsClaimed && nextSeats < capacity.offer.availableSeats) {
        throw new CapacityConflict(
          "NO_SEATS",
          `This offer already has ${capacity.seatsClaimed} claimed seat${capacity.seatsClaimed === 1 ? "" : "s"}. Remove claims before lowering the seat count.`,
        );
      }
      if (nextTrays < capacity.bikeTraysClaimed && nextTrays < capacity.offer.bikeTrayCount) {
        throw new CapacityConflict(
          "NO_BIKE_TRAYS",
          `This offer already has ${capacity.bikeTraysClaimed} claimed bike tray${capacity.bikeTraysClaimed === 1 ? "" : "s"}. Remove claims before lowering the tray count.`,
        );
      }

      const [result] = await tx.update(carpoolOffersTable)
        .set({
          ...(availableSeats !== undefined ? { availableSeats } : {}),
          ...(bikeTrayCount !== undefined ? { bikeTrayCount } : {}),
          ...(departureLocation !== undefined ? { departureLocation } : {}),
          ...(departureTime !== undefined ? { departureTime: departureTime ? new Date(departureTime) : null } : {}),
          ...(notes !== undefined ? { notes } : {}),
        })
        .where(eq(carpoolOffersTable.id, offerId))
        .returning();
      return result;
    });
  } catch (err) {
    if (isCapacityConflict(err)) {
      sendCapacityConflict(res, err);
      return;
    }
    if (err instanceof Error && err.message === "INVALID_CAPACITY") {
      res.status(400).json({ error: "Seats and bike trays must be non-negative whole numbers" });
      return;
    }
    if (err instanceof Error && err.message === "OFFER_NOT_FOUND") {
      res.status(404).json({ error: "Offer not found" });
      return;
    }
    throw err;
  }
  res.json(updated);
});

router.delete("/carpools/:offerId", requireApproved, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  const isCoachOrAdmin = requester.role === "coach" || requester.role === "super_admin";
  if (!isCoachOrAdmin && offer.driverUserId !== requester.id) {
    res.status(403).json({ error: "You can only delete your own carpool offer" });
    return;
  }
  await db.delete(carpoolOffersTable).where(eq(carpoolOffersTable.id, offerId));
  res.status(204).send();
});

router.post("/carpools/:offerId/claims", requireApproved, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { needsSeat, needsBikeTray, notes, riderUserId: riderUserIdBody } = req.body;
  // Accept an explicit riderUserId (for claiming on behalf of a student),
  // otherwise fall back to the logged-in parent
  const riderUserId = riderUserIdBody ?? me.id;
  const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (riderUserId !== me.id) {
    const rider = me.householdId == null
      ? null
      : await db.query.usersTable.findFirst({
          where: and(eq(usersTable.id, riderUserId), eq(usersTable.householdId, me.householdId)),
        });
    if (!rider) {
      res.status(403).json({ error: "You can only claim a carpool spot for members of your own household" });
      return;
    }
  }
  let claim;
  try {
    claim = await db.transaction(async (tx) => {
      await lockOffer(tx, offerId);
      const capacity = await getOfferCapacity(tx, offerId);
      if (!capacity) throw new Error("OFFER_NOT_FOUND");
      const claimNeedsSeat = needsSeat ?? true;
      const claimNeedsBikeTray = needsBikeTray ?? false;
      assertCapacityForNewClaim(capacity, claimNeedsSeat, claimNeedsBikeTray);
      const [created] = await tx.insert(carpoolClaimsTable).values({
        eventId: capacity.offer.eventId,
        carpoolOfferId: offerId,
        riderUserId,
        needsSeat: claimNeedsSeat,
        needsBikeTray: claimNeedsBikeTray,
        notes: notes ?? null,
        matchedByDriver: false,
      }).returning();
      return created;
    });
  } catch (err) {
    if (isCapacityConflict(err)) {
      sendCapacityConflict(res, err);
      return;
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: CLAIM_CONFLICT_MESSAGE });
      return;
    }
    throw err;
  }

  (async () => {
    try {
      const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
      if (!offer) return;
      const driver = await db.query.usersTable.findFirst({ where: eq(usersTable.id, offer.driverUserId) });
      if (!driver || !driver.emailNotifications) return;
      const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, riderUserId) });
      const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, offer.eventId) });
      const riderName = rider ? `${rider.firstName} ${rider.lastName}` : "Someone";
      const eventName = event?.title ?? "your event";
      const orgPrefix = await getShortNamePrefix();
      const message = addEmailLinks(
        [
          `Hi ${driver.firstName},`,
          ``,
          `${riderName} just claimed a spot in your carpool for ${eventName}.`,
          ``,
          `Head to TrailTeam to view the full carpool board.`,
          `— TrailTeam`,
        ].join("\n"),
        [createEmailLink(`/carpools/${offer.eventId}`, "View carpool board")],
      );
      await sendEmail({
        to: driver.email,
        subject: `${orgPrefix}${riderName} claimed your carpool spot`,
        ...message,
      });
    } catch (err) {
      logger.error({ err }, "[carpools] claim notification email error");
    }
  })();

  res.status(201).json(claim);
});

router.patch("/carpools/:offerId/claims/:claimId", requireApproved, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const claimId = parseInt(str(req.params.claimId));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  const claim = await db.query.carpoolClaimsTable.findFirst({ where: eq(carpoolClaimsTable.id, claimId) });
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  if (claim.carpoolOfferId !== offerId) { res.status(404).json({ error: "Claim not found" }); return; }
  if (!(await canManageClaim(requester, claim))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { needsSeat, needsBikeTray, notes } = req.body;
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      await lockOffer(tx, offerId);
      const capacity = await getOfferCapacity(tx, offerId);
      if (!capacity) throw new Error("OFFER_NOT_FOUND");
      const currentClaim = capacity.claims.find((item: any) => item.id === claimId);
      if (!currentClaim) throw new Error("CLAIM_NOT_FOUND");

      const nextNeedsSeat = needsSeat ?? currentClaim.needsSeat;
      const nextNeedsBikeTray = needsBikeTray ?? currentClaim.needsBikeTray;
      const increasesCapacity =
        (nextNeedsSeat && !currentClaim.needsSeat) ||
        (nextNeedsBikeTray && !currentClaim.needsBikeTray);
      if (increasesCapacity) {
        const capacityWithoutClaim = {
          ...capacity,
          seatsClaimed: capacity.seatsClaimed - (currentClaim.needsSeat ? 1 : 0),
          bikeTraysClaimed: capacity.bikeTraysClaimed - (currentClaim.needsBikeTray ? 1 : 0),
        };
        assertCapacityForNewClaim(capacityWithoutClaim, nextNeedsSeat, nextNeedsBikeTray);
      }

      const [result] = await tx.update(carpoolClaimsTable)
        .set({
          ...(needsSeat !== undefined ? { needsSeat } : {}),
          ...(needsBikeTray !== undefined ? { needsBikeTray } : {}),
          ...(notes !== undefined ? { notes } : {}),
        })
        .where(eq(carpoolClaimsTable.id, claimId))
        .returning();
      return result;
    });
  } catch (err) {
    if (isCapacityConflict(err)) {
      sendCapacityConflict(res, err);
      return;
    }
    if (err instanceof Error && err.message === "CLAIM_NOT_FOUND") {
      res.status(404).json({ error: "Claim not found" });
      return;
    }
    throw err;
  }
  res.json(updated);
});

router.delete("/carpools/:offerId/claims/:claimId", requireApproved, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const claimId = parseInt(str(req.params.claimId));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  const claim = await db.query.carpoolClaimsTable.findFirst({ where: eq(carpoolClaimsTable.id, claimId) });
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  if (claim.carpoolOfferId !== offerId) { res.status(404).json({ error: "Claim not found" }); return; }
  if (!(await canManageClaim(requester, claim))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(carpoolClaimsTable).where(eq(carpoolClaimsTable.id, claimId));
  res.status(204).send();
});

async function buildRequestWithUsers(req: any) {
  const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.riderUserId) });
  const requestedBy = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.requestedByUserId) });
  let matchedOffer = null;
  if (req.matchedOfferId) {
    const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, req.matchedOfferId) });
    if (offer) {
      const driver = await db.query.usersTable.findFirst({ where: eq(usersTable.id, offer.driverUserId) });
      matchedOffer = { ...offer, driver };
    }
  }
  return { ...req, rider, requestedBy, matchedOffer };
}

router.get("/events/:id/carpool-requests", requireApproved, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const requests = await db.select().from(carpoolRequestsTable).where(eq(carpoolRequestsTable.eventId, eventId));
  const result = await Promise.all(requests.map(buildRequestWithUsers));
  res.json(result);
});

router.post("/events/:id/carpool-requests", requireApproved, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { riderUserId, needsBikeTray, notes } = req.body;

  // Determine the rider: default to the requesting user themselves
  const riderId: number = riderUserId ?? me.id;

  // Authorization: riderUserId must be the caller or a student in their household
  if (riderId !== me.id) {
    if (!me.householdId) {
      res.status(403).json({ error: "You are not authorized to request a ride for this rider" });
      return;
    }
    const riderInHousehold = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.id, riderId),
        eq(usersTable.householdId, me.householdId),
      ),
    });
    if (!riderInHousehold) {
      res.status(403).json({ error: "You are not authorized to request a ride for this rider" });
      return;
    }
  }

  // Check for duplicate non-cancelled request for the same rider + event
  const [existingActive] = await db
    .select()
    .from(carpoolRequestsTable)
    .where(
      and(
        eq(carpoolRequestsTable.eventId, eventId),
        eq(carpoolRequestsTable.riderUserId, riderId),
        ne(carpoolRequestsTable.status, "cancelled"),
      )
    )
    .limit(1);

  if (existingActive) {
    res.status(409).json({ error: "A request for this rider already exists for this event" });
    return;
  }

  const [request] = await db.insert(carpoolRequestsTable).values({
    eventId,
    riderUserId: riderId,
    requestedByUserId: me.id,
    needsBikeTray: needsBikeTray ?? false,
    notes: notes ?? null,
    status: "open",
  }).returning();

  (async () => {
    try {
      const activeOffers = await db
        .select()
        .from(carpoolOffersTable)
        .where(eq(carpoolOffersTable.eventId, eventId));
      const requesterName = `${me.firstName} ${me.lastName}`;
      for (const offer of activeOffers) {
        if (offer.driverUserId !== me.id) {
          await createNotification(
            offer.driverUserId,
            "carpool_request_posted",
            "New Ride Request",
            `${requesterName} posted a ride request for this event.`,
            `/carpools/${eventId}`
          );
        }
      }
    } catch (err) {
      console.error("[notifications] request trigger failed:", err);
    }
  })();

  const result = await buildRequestWithUsers(request);
  res.status(201).json(result);
});

router.patch("/carpool-requests/:id", requireApproved, async (req, res) => {
  const requestId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const existing = await db.query.carpoolRequestsTable.findFirst({ where: eq(carpoolRequestsTable.id, requestId) });
  if (!existing) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (existing.requestedByUserId !== me.id) {
    res.status(403).json({ error: "You do not own this request" });
    return;
  }
  if (existing.status !== "open") {
    res.status(409).json({ error: "Only open requests can be edited" });
    return;
  }

  const { needsBikeTray, notes, status } = req.body;

  if ("matchedOfferId" in req.body) {
    res.status(409).json({ error: "matchedOfferId can only be set by the match endpoint" });
    return;
  }

  // Matching must go through the capacity-checked match endpoint.
  if (status !== undefined) {
    if (status !== "cancelled") {
      res.status(409).json({ error: "Invalid status transition" });
      return;
    }
  }

  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const [current] = await tx
        .select()
        .from(carpoolRequestsTable)
        .where(eq(carpoolRequestsTable.id, requestId))
        .limit(1);
      if (!current) throw new Error("REQUEST_NOT_FOUND");
      if (current.requestedByUserId !== me.id) throw new Error("REQUEST_FORBIDDEN");
      if (current.status !== "open") throw new Error("REQUEST_NOT_OPEN");

      const [result] = await tx
        .update(carpoolRequestsTable)
        .set({
          ...(needsBikeTray !== undefined ? { needsBikeTray } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(status !== undefined ? { status } : {}),
        })
        .where(and(eq(carpoolRequestsTable.id, requestId), eq(carpoolRequestsTable.status, "open")))
        .returning();
      if (!result) throw new Error("REQUEST_NOT_OPEN");
      return result;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "REQUEST_NOT_FOUND") {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (err instanceof Error && err.message === "REQUEST_FORBIDDEN") {
      res.status(403).json({ error: "You do not own this request" });
      return;
    }
    if (err instanceof Error && err.message === "REQUEST_NOT_OPEN") {
      res.status(409).json({ error: "Only open requests can be edited" });
      return;
    }
    throw err;
  }
  const result = await buildRequestWithUsers(updated);
  res.json(result);
});

router.delete("/carpool-requests/:id", requireApproved, async (req, res) => {
  const requestId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const existing = await db.query.carpoolRequestsTable.findFirst({ where: eq(carpoolRequestsTable.id, requestId) });
  if (!existing) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (existing.requestedByUserId !== me.id) {
    res.status(403).json({ error: "You do not own this request" });
    return;
  }
  if (existing.status !== "open") {
    res.status(409).json({ error: "Only open requests can be deleted" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const [current] = await tx
        .select()
        .from(carpoolRequestsTable)
        .where(eq(carpoolRequestsTable.id, requestId))
        .limit(1);
      if (!current) throw new Error("REQUEST_NOT_FOUND");
      if (current.requestedByUserId !== me.id) throw new Error("REQUEST_FORBIDDEN");
      if (current.status !== "open") throw new Error("REQUEST_NOT_OPEN");

      const [deleted] = await tx
        .delete(carpoolRequestsTable)
        .where(and(eq(carpoolRequestsTable.id, requestId), eq(carpoolRequestsTable.status, "open")))
        .returning();
      if (!deleted) throw new Error("REQUEST_NOT_OPEN");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "REQUEST_NOT_FOUND") {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (err instanceof Error && err.message === "REQUEST_FORBIDDEN") {
      res.status(403).json({ error: "You do not own this request" });
      return;
    }
    if (err instanceof Error && err.message === "REQUEST_NOT_OPEN") {
      res.status(409).json({ error: "Only open requests can be deleted" });
      return;
    }
    throw err;
  }
  res.status(204).send();
});

router.post("/carpool-requests/:id/match", requireApproved, async (req, res) => {
  const requestId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (me.role === "student") {
    res.status(403).json({ error: "Students cannot offer rides or match ride requests" });
    return;
  }

  const offerId = req.body.offerId == null ? null : Number(req.body.offerId);
  let ownedOffer = null;
  if (offerId !== null) {
    if (!Number.isInteger(offerId)) {
      res.status(400).json({ error: "offerId must be an integer" });
      return;
    }
    ownedOffer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
    if (!ownedOffer) {
      res.status(404).json({ error: "Offer not found" });
      return;
    }
    if (ownedOffer.driverUserId !== me.id) {
      res.status(403).json({ error: "You do not own this offer" });
      return;
    }
  }

  // Verify request exists and is open
  const request = await db.query.carpoolRequestsTable.findFirst({ where: eq(carpoolRequestsTable.id, requestId) });
  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (request.status !== "open") {
    res.status(409).json({ error: "Request is not open" });
    return;
  }

  // Ensure offer and request are for the same event
  if (ownedOffer && ownedOffer.eventId !== request.eventId) {
    res.status(409).json({ error: "Offer and request are not for the same event" });
    return;
  }

  let conflictReason: "already-matched" | "rider-claimed" | null = null;
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const [currentRequest] = await tx
        .select()
        .from(carpoolRequestsTable)
        .where(eq(carpoolRequestsTable.id, requestId))
        .limit(1);
      if (!currentRequest || currentRequest.status !== "open") {
        throw new Error("ALREADY_MATCHED");
      }

      const claimNeedsBikeTray =
        req.body.needsBikeTray === false ? false : currentRequest.needsBikeTray;
      let activeOfferId = offerId;

      if (activeOfferId === null) {
        const defaultSeats = isValidCapacity(me.defaultCarpoolSeats)
          ? Math.max(1, me.defaultCarpoolSeats)
          : 1;
        const defaultTrays = isValidCapacity(me.defaultCarpoolTrays)
          ? me.defaultCarpoolTrays
          : 0;
        const [createdOffer] = await tx
          .insert(carpoolOffersTable)
          .values({
            eventId: currentRequest.eventId,
            driverUserId: me.id,
            availableSeats: defaultSeats,
            bikeTrayCount: defaultTrays,
          })
          .returning();
        activeOfferId = createdOffer.id;
      }

      await lockOffer(tx, activeOfferId);
      const capacity = await getOfferCapacity(tx, activeOfferId);
      if (!capacity) throw new Error("OFFER_NOT_FOUND");
      if (capacity.offer.driverUserId !== me.id) throw new Error("OFFER_FORBIDDEN");
      if (capacity.offer.eventId !== currentRequest.eventId) throw new Error("EVENT_MISMATCH");
      assertCapacityForNewClaim(capacity, true, claimNeedsBikeTray);

      const [matched] = await tx
        .update(carpoolRequestsTable)
        .set({
          status: "matched",
          matchedOfferId: activeOfferId,
          ...(claimNeedsBikeTray !== currentRequest.needsBikeTray
            ? { needsBikeTray: claimNeedsBikeTray }
            : {}),
        })
        .where(and(eq(carpoolRequestsTable.id, requestId), eq(carpoolRequestsTable.status, "open")))
        .returning();
      if (!matched) throw new Error("ALREADY_MATCHED");

      await tx.insert(carpoolClaimsTable).values({
        eventId: matched.eventId,
        carpoolOfferId: activeOfferId,
        riderUserId: matched.riderUserId,
        needsSeat: true,
        needsBikeTray: claimNeedsBikeTray,
        notes: matched.notes ?? null,
        matchedByDriver: true,
      });

      return matched;
    });
  } catch (err) {
    if (isCapacityConflict(err)) {
      sendCapacityConflict(res, err);
      return;
    }
    if (err instanceof Error && err.message === "ALREADY_MATCHED") {
      conflictReason = "already-matched";
    } else if (isUniqueViolation(err)) {
      conflictReason = "rider-claimed";
    } else if (err instanceof Error && err.message === "OFFER_NOT_FOUND") {
      res.status(404).json({ error: "Offer not found" });
      return;
    } else if (err instanceof Error && err.message === "OFFER_FORBIDDEN") {
      res.status(403).json({ error: "You do not own this offer" });
      return;
    } else if (err instanceof Error && err.message === "EVENT_MISMATCH") {
      res.status(409).json({ error: "Offer and request are not for the same event" });
      return;
    } else {
      throw err;
    }
  }

  if (!updated) {
    res.status(409).json({
      error: conflictReason === "rider-claimed"
        ? CLAIM_CONFLICT_MESSAGE
        : "Request has already been matched",
    });
    return;
  }

  const result = await buildRequestWithUsers(updated);

  (async () => {
    try {
      const driverName = `${me.firstName} ${me.lastName}`;
      await createNotification(
        updated.requestedByUserId,
        "carpool_request_matched",
        "Ride Matched!",
        `${driverName} accepted your ride request and will give you a lift.`,
        `/carpools/${updated.eventId}`
      );
    } catch (err) {
      console.error("[notifications] match trigger failed:", err);
    }
  })();

  res.json(result);
});

export default router;
