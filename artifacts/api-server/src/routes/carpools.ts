import { Router } from "express";
import { db } from "@workspace/db";
import {
  carpoolOffersTable,
  carpoolClaimsTable,
  carpoolRequestsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

async function buildOfferWithClaims(offer: any) {
  const driver = await db.query.usersTable.findFirst({ where: eq(usersTable.id, offer.driverUserId) });
  const claims = await db.select().from(carpoolClaimsTable).where(eq(carpoolClaimsTable.carpoolOfferId, offer.id));
  const claimsWithUsers = await Promise.all(
    claims.map(async (c) => {
      const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, c.riderUserId) });
      return { ...c, rider };
    })
  );
  // Only self-claimed seats/trays (matchedByDriver = false) consume advertised
  // capacity. Driver-initiated matches via "I'll Take Them" are tracked for trip
  // logistics but don't reduce the displayed availability.
  const advertisedClaims = claims.filter((c) => !c.matchedByDriver);
  const seatsClaimed = advertisedClaims.filter((c) => c.needsSeat).length;
  const bikeTraysClaimed = advertisedClaims.filter((c) => c.needsBikeTray).length;
  return {
    ...offer,
    driver,
    claims: claimsWithUsers,
    seatsRemaining: Math.max(0, offer.availableSeats - seatsClaimed),
    bikeTraysRemaining: Math.max(0, offer.bikeTrayCount - bikeTraysClaimed),
  };
}

router.get("/events/:id/carpools", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, eventId));
  const result = await Promise.all(offers.map(buildOfferWithClaims));
  res.json(result);
});

router.post("/events/:id/carpools", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { availableSeats, bikeTrayCount, departureLocation, departureTime, notes } = req.body;
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

router.patch("/carpools/:offerId", requireAuth, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  const { availableSeats, bikeTrayCount, departureLocation, departureTime, notes } = req.body;
  const [updated] = await db.update(carpoolOffersTable)
    .set({ availableSeats, bikeTrayCount, departureLocation, departureTime: departureTime ? new Date(departureTime) : undefined, notes })
    .where(eq(carpoolOffersTable.id, offerId))
    .returning();
  res.json(updated);
});

router.delete("/carpools/:offerId", requireAuth, async (req, res) => {
  const offerId = parseInt(str(req.params.offerId));
  await db.delete(carpoolOffersTable).where(eq(carpoolOffersTable.id, offerId));
  res.status(204).send();
});

router.post("/carpools/:offerId/claims", requireAuth, async (req, res) => {
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
  const [claim] = await db.insert(carpoolClaimsTable).values({
    carpoolOfferId: offerId,
    riderUserId,
    needsSeat: needsSeat ?? true,
    needsBikeTray: needsBikeTray ?? false,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(claim);
});

router.patch("/carpools/:offerId/claims/:claimId", requireAuth, async (req, res) => {
  const claimId = parseInt(str(req.params.claimId));
  const { needsSeat, needsBikeTray, notes } = req.body;
  const [updated] = await db.update(carpoolClaimsTable)
    .set({
      ...(needsSeat !== undefined ? { needsSeat } : {}),
      ...(needsBikeTray !== undefined ? { needsBikeTray } : {}),
      ...(notes !== undefined ? { notes } : {}),
    })
    .where(eq(carpoolClaimsTable.id, claimId))
    .returning();
  res.json(updated);
});

router.delete("/carpools/:offerId/claims/:claimId", requireAuth, async (req, res) => {
  const claimId = parseInt(str(req.params.claimId));
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

router.get("/events/:id/carpool-requests", requireAuth, async (req, res) => {
  const eventId = parseInt(str(req.params.id));
  const requests = await db.select().from(carpoolRequestsTable).where(eq(carpoolRequestsTable.eventId, eventId));
  const result = await Promise.all(requests.map(buildRequestWithUsers));
  res.json(result);
});

router.post("/events/:id/carpool-requests", requireAuth, async (req, res) => {
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

router.patch("/carpool-requests/:id", requireAuth, async (req, res) => {
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

  const { needsBikeTray, notes, status, matchedOfferId } = req.body;

  // Validate status transitions: open -> cancelled or open -> matched (with matchedOfferId)
  if (status !== undefined) {
    if (status !== "cancelled" && status !== "matched") {
      res.status(409).json({ error: "Invalid status transition" });
      return;
    }
    if (status === "matched" && !matchedOfferId) {
      res.status(400).json({ error: "matchedOfferId is required when setting status to matched" });
      return;
    }
  }

  const [updated] = await db.update(carpoolRequestsTable)
    .set({
      ...(needsBikeTray !== undefined ? { needsBikeTray } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(matchedOfferId !== undefined ? { matchedOfferId } : {}),
    })
    .where(eq(carpoolRequestsTable.id, requestId))
    .returning();
  const result = await buildRequestWithUsers(updated);
  res.json(result);
});

router.delete("/carpool-requests/:id", requireAuth, async (req, res) => {
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

  await db.delete(carpoolRequestsTable).where(eq(carpoolRequestsTable.id, requestId));
  res.status(204).send();
});

router.post("/carpool-requests/:id/match", requireAuth, async (req, res) => {
  const requestId = parseInt(str(req.params.id));
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const { offerId } = req.body;
  if (!offerId) {
    res.status(400).json({ error: "offerId is required" });
    return;
  }

  // Verify driver owns the offer
  const offer = await db.query.carpoolOffersTable.findFirst({ where: eq(carpoolOffersTable.id, offerId) });
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (offer.driverUserId !== me.id) {
    res.status(403).json({ error: "You do not own this offer" });
    return;
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
  if (offer.eventId !== request.eventId) {
    res.status(409).json({ error: "Offer and request are not for the same event" });
    return;
  }

  // Atomically create a claim and mark the request matched in a transaction.
  // Capacity is NOT enforced here — the driver owns the offer and explicitly
  // accepted this request, so we trust their judgement on seat availability.
  // The claim is flagged matchedByDriver=true so it doesn't reduce the offer's
  // displayed seat/tray availability in the UI.
  let alreadyMatched = false;
  const updated = await db.transaction(async (tx) => {
    // Re-verify request is still open inside the transaction (prevents double-match races)
    const [freshRequest] = await tx
      .select()
      .from(carpoolRequestsTable)
      .where(and(eq(carpoolRequestsTable.id, requestId), eq(carpoolRequestsTable.status, "open")))
      .limit(1);

    if (!freshRequest) {
      throw new Error("ALREADY_MATCHED");
    }

    await tx.insert(carpoolClaimsTable).values({
      carpoolOfferId: offerId,
      riderUserId: freshRequest.riderUserId,
      needsSeat: true,
      needsBikeTray: freshRequest.needsBikeTray,
      notes: freshRequest.notes ?? null,
      matchedByDriver: true,
    });

    const [matched] = await tx
      .update(carpoolRequestsTable)
      .set({ status: "matched", matchedOfferId: offerId })
      .where(eq(carpoolRequestsTable.id, requestId))
      .returning();

    return matched;
  }).catch((err) => {
    if (err.message === "ALREADY_MATCHED") { alreadyMatched = true; return null; }
    throw err;
  });

  if (!updated) {
    res.status(409).json({ error: alreadyMatched ? "Request has already been matched" : "Match failed" });
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
