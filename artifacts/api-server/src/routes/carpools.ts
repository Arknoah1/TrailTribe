import { Router } from "express";
import { db } from "@workspace/db";
import {
  carpoolOffersTable,
  carpoolClaimsTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

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
  return {
    ...offer,
    driver,
    claims: claimsWithUsers,
    seatsRemaining: Math.max(0, offer.availableSeats - seatsClaimed),
    bikeTraysRemaining: Math.max(0, offer.bikeTrayCount - bikeTraysClaimed),
  };
}

router.get("/events/:id/carpools", requireAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const offers = await db.select().from(carpoolOffersTable).where(eq(carpoolOffersTable.eventId, eventId));
  const result = await Promise.all(offers.map(buildOfferWithClaims));
  res.json(result);
});

router.post("/events/:id/carpools", requireAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
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
  res.status(201).json(offer);
});

router.patch("/carpools/:offerId", requireAuth, async (req, res) => {
  const offerId = parseInt(req.params.offerId);
  const { availableSeats, bikeTrayCount, departureLocation, departureTime, notes } = req.body;
  const [updated] = await db.update(carpoolOffersTable)
    .set({ availableSeats, bikeTrayCount, departureLocation, departureTime: departureTime ? new Date(departureTime) : undefined, notes })
    .where(eq(carpoolOffersTable.id, offerId))
    .returning();
  res.json(updated);
});

router.delete("/carpools/:offerId", requireAuth, async (req, res) => {
  const offerId = parseInt(req.params.offerId);
  await db.delete(carpoolOffersTable).where(eq(carpoolOffersTable.id, offerId));
  res.status(204).send();
});

router.post("/carpools/:offerId/claims", requireAuth, async (req, res) => {
  const offerId = parseInt(req.params.offerId);
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

router.delete("/carpools/:offerId/claims/:claimId", requireAuth, async (req, res) => {
  const claimId = parseInt(req.params.claimId);
  await db.delete(carpoolClaimsTable).where(eq(carpoolClaimsTable.id, claimId));
  res.status(204).send();
});

export default router;
