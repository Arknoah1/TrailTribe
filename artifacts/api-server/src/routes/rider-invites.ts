import { Router } from "express";
import { db } from "@workspace/db";
import { riderInvitesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { publicLookupLimiter } from "../middlewares/rateLimiter";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { randomBytes } from "crypto";
import { createClerkClient } from "@clerk/express";
import { getOrCreateSettings } from "./settings";
import { getAppBase } from "../lib/config";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const INVITE_TTL_DAYS = 7;

function expiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

async function getRequester(req: any) {
  const clerkUserId = (req as any).clerkUserId as string | null;
  if (!clerkUserId) return null;
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

// POST /households/:id/riders/:riderId/invite
// Send an invite email to a rider so they can create their own app login.
// Allowed by: household members OR coach/admin.
router.post("/households/:id/riders/:riderId/invite", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));

  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Load the rider — must be a student in this household
  const rider = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, riderId),
  });
  if (!rider || rider.role !== "student" || rider.householdId !== householdId) {
    res.status(404).json({ error: "Rider not found" }); return;
  }
  if (!rider.email || rider.email.endsWith("@trailtribe.internal")) {
    res.status(400).json({ error: "This rider doesn't have a real email address. Add one before sending an invite." }); return;
  }
  if (rider.clerkUserId) {
    res.status(409).json({ error: "This rider already has app access." }); return;
  }

  const appBase = getAppBase();
  if (!appBase) {
    res.status(500).json({ error: "Server misconfiguration: invite base URL is not set." }); return;
  }

  // Revoke any existing pending invite for this rider
  const existing = await db.query.riderInvitesTable.findFirst({
    where: and(
      eq(riderInvitesTable.riderId, riderId),
      isNull(riderInvitesTable.acceptedAt),
      isNull(riderInvitesTable.revokedAt),
    ),
  });
  if (existing) {
    await db.update(riderInvitesTable)
      .set({ revokedAt: new Date() })
      .where(eq(riderInvitesTable.id, existing.id));
  }

  const token = randomBytes(24).toString("hex");
  await db.insert(riderInvitesTable).values({
    riderId,
    token,
    invitedByUserId: requester.id,
    expiresAt: expiresAt(),
  });

  const inviteUrl = `${appBase}/rider-invite/${token}`;
  const settings = await getOrCreateSettings();
  const teamName = settings.teamName?.trim() || null;
  const orgPrefix = settings.shortName?.trim() ? `${settings.shortName.trim()}: ` : "";
  const subject = teamName
    ? `${orgPrefix}You've been invited to join ${teamName} on TrailTeam`
    : `${orgPrefix}You've been invited to TrailTeam`;

  const emailResult = await sendEmail({
    to: rider.email,
    subject,
    text: [
      `Hi ${rider.firstName}!`,
      ``,
      `${requester.firstName} ${requester.lastName} has invited you to access TrailTeam — your team's hub for schedules, RSVPs, carpools, and communication.`,
      ``,
      `Click the link below to create your account. This link is valid for ${INVITE_TTL_DAYS} days and is for your use only.`,
      ``,
      inviteUrl,
      ``,
      `If you weren't expecting this, you can safely ignore this email.`,
      ``,
      `— The TrailTeam`,
    ].join("\n"),
  });

  logger.info({ riderId, status: emailResult.status }, "[rider-invites] invite sent");
  res.status(201).json({ status: emailResult.status, inviteUrl });
});

// GET /rider-invites/validate/:token — public; check token validity
router.get("/rider-invites/validate/:token", publicLookupLimiter, async (req, res) => {
  const token = str(req.params.token);
  const now = new Date();
  const invite = await db.query.riderInvitesTable.findFirst({
    where: and(
      eq(riderInvitesTable.token, token),
      isNull(riderInvitesTable.acceptedAt),
      isNull(riderInvitesTable.revokedAt),
      gt(riderInvitesTable.expiresAt, now),
    ),
  });
  if (!invite) {
    res.status(404).json({ error: "Invite link is invalid, expired, or already used" }); return;
  }
  const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, invite.riderId) });
  res.json({
    riderFirstName: rider?.firstName ?? null,
    riderEmail: rider?.email ?? null,
  });
});

// POST /rider-invites/accept — authenticated; link Clerk account to existing rider row
router.post("/rider-invites/accept", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" }); return;
  }

  const clerkUserId = (req as any).clerkUserId as string;
  const now = new Date();

  const invite = await db.query.riderInvitesTable.findFirst({
    where: and(
      eq(riderInvitesTable.token, token),
      isNull(riderInvitesTable.acceptedAt),
      isNull(riderInvitesTable.revokedAt),
      gt(riderInvitesTable.expiresAt, now),
    ),
  });
  if (!invite) {
    res.status(404).json({ error: "Invite link is invalid, expired, or already used" }); return;
  }

  // Verify the Clerk user exists and get their primary email
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  let clerkUser: Awaited<ReturnType<typeof clerkClient.users.getUser>>;
  try {
    clerkUser = await clerkClient.users.getUser(clerkUserId);
  } catch (err) {
    logger.error({ err, clerkUserId }, "[rider-invites] Clerk user lookup failed");
    res.status(500).json({ error: "Could not verify your identity. Please try again." }); return;
  }

  // Load the rider row
  const rider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, invite.riderId) });
  if (!rider) {
    res.status(404).json({ error: "Rider record not found." }); return;
  }
  if (rider.clerkUserId && rider.clerkUserId !== clerkUserId) {
    res.status(409).json({ error: "This rider already has a different account linked." }); return;
  }

  // Ensure the signed-in account's primary email matches the rider email on record.
  // If they differ the invite flow would create a second user row instead of linking
  // to the existing student — catch it here before that can happen.
  const clerkPrimaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? null;

  if (
    rider.email &&
    clerkPrimaryEmail &&
    rider.email.toLowerCase() !== clerkPrimaryEmail.toLowerCase()
  ) {
    logger.warn(
      { riderId: rider.id, riderEmail: rider.email, clerkEmail: clerkPrimaryEmail },
      "[rider-invites] email mismatch on accept",
    );
    res.status(409).json({
      error: `This invite was sent to ${rider.email}. You're signed in as ${clerkPrimaryEmail}. Please sign out and sign back in using ${rider.email}.`,
      code: "EMAIL_MISMATCH",
    });
    return;
  }

  // Link the Clerk account to the rider row and approve them
  await db.update(usersTable)
    .set({ clerkUserId, approved: true })
    .where(eq(usersTable.id, rider.id));

  // Consume the invite
  await db.update(riderInvitesTable)
    .set({ acceptedAt: now })
    .where(eq(riderInvitesTable.id, invite.id));

  logger.info({ riderId: rider.id, clerkUserId }, "[rider-invites] rider account linked successfully");
  res.json({ ok: true });
});

export default router;
