import { Router } from "express";
import { db } from "@workspace/db";
import { familyInvitesTable, usersTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { randomBytes } from "crypto";
import { createClerkClient } from "@clerk/express";
import { z } from "zod";
import { getOrCreateSettings } from "./settings";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const INVITE_TTL_DAYS = 7;

const DEFAULT_NOTIFICATION_PREFS = {
  practiceReminders: true,
  coachMessages: true,
  carpoolUpdates: true,
  eventReminders: true,
  rosterUpdates: true,
  boardReplies: true,
};

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

const sendInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
});

// GET /family-invites — list all invites (coach/admin)
router.get("/family-invites", requireCoachOrAdmin, async (_req, res) => {
  const invites = await db.select().from(familyInvitesTable).orderBy(familyInvitesTable.createdAt);
  res.json(invites);
});

// POST /family-invites — send one or more email invites
router.post("/family-invites", requireCoachOrAdmin, async (req, res) => {
  const parsed = sendInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const requester = await getRequester(req);
  const invitedByUserId = requester?.id ?? null;
  const appBase = process.env.APP_BASE_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const results: { email: string; status: string }[] = [];

  for (const rawEmail of parsed.data.emails) {
    const email = rawEmail.toLowerCase();

    // Revoke any existing pending invite for this email so re-send generates a fresh link
    const existing = await db.query.familyInvitesTable.findFirst({
      where: and(
        eq(familyInvitesTable.email, email),
        isNull(familyInvitesTable.acceptedAt),
        isNull(familyInvitesTable.revokedAt),
      ),
    });
    if (existing) {
      await db.update(familyInvitesTable)
        .set({ revokedAt: new Date() })
        .where(eq(familyInvitesTable.id, existing.id));
    }

    const token = randomBytes(24).toString("hex");
    await db.insert(familyInvitesTable).values({
      email,
      token,
      invitedByUserId,
      expiresAt: expiresAt(),
    });

    const inviteUrl = `${appBase}/family-invite/${token}`;
    const coachName = requester
      ? `${requester.firstName} ${requester.lastName}`.trim()
      : "Your coach";

    const settings = await getOrCreateSettings();
    const teamName = settings.teamName?.trim() || null;
    const teamPhrase = teamName ? `join ${teamName} on TrailTribe` : `join TrailTribe`;
    const orgPrefix = settings.shortName?.trim() ? `${settings.shortName.trim()}: ` : "";
    const subject = teamName
      ? `${orgPrefix}You've been invited to join ${teamName} on TrailTribe`
      : `${orgPrefix}You've been invited to join TrailTribe`;

    const emailResult = await sendEmail({
      to: email,
      subject,
      text: [
        `Hi there!`,
        ``,
        `${coachName} has invited you to ${teamPhrase} — your team's hub for schedules, carpools, and communication.`,
        ``,
        `Click the link below to create your account and get started. This link is valid for ${INVITE_TTL_DAYS} days.`,
        ``,
        inviteUrl,
        ``,
        `If you weren't expecting this invite, you can safely ignore this email.`,
        ``,
        `— The TrailTribe Team`,
      ].join("\n"),
    });

    results.push({ email, status: emailResult.status });
  }

  res.status(201).json({ results });
});

// DELETE /family-invites/:id — revoke/cancel an invite
router.delete("/family-invites/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const invite = await db.query.familyInvitesTable.findFirst({
    where: eq(familyInvitesTable.id, id),
  });
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (invite.acceptedAt) {
    res.status(400).json({ error: "Cannot revoke an already-accepted invite" });
    return;
  }
  const [updated] = await db.update(familyInvitesTable)
    .set({ revokedAt: new Date() })
    .where(eq(familyInvitesTable.id, id))
    .returning();
  res.json(updated);
});

// GET /family-invites/validate/:token — public; check token validity
router.get("/family-invites/validate/:token", async (req, res) => {
  const token = str(req.params.token);
  const now = new Date();
  const invite = await db.query.familyInvitesTable.findFirst({
    where: and(
      eq(familyInvitesTable.token, token),
      isNull(familyInvitesTable.acceptedAt),
      isNull(familyInvitesTable.revokedAt),
      gt(familyInvitesTable.expiresAt, now),
    ),
  });
  if (!invite) {
    res.status(404).json({ error: "Invite link is invalid, expired, or already used" });
    return;
  }
  res.json({ email: invite.email });
});

// POST /family-invites/accept — authenticated; accept invite and auto-approve user
router.post("/family-invites/accept", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const clerkUserId = (req as any).clerkUserId as string;
  const now = new Date();

  // Validate the invite token (not expired, not revoked, not already accepted)
  const invite = await db.query.familyInvitesTable.findFirst({
    where: and(
      eq(familyInvitesTable.token, token),
      isNull(familyInvitesTable.acceptedAt),
      isNull(familyInvitesTable.revokedAt),
      gt(familyInvitesTable.expiresAt, now),
    ),
  });

  if (!invite) {
    res.status(404).json({ error: "Invite link is invalid, expired, or already used" });
    return;
  }

  // Fetch the Clerk user — fail hard if we can't (never silently consume the invite)
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  let clerkUser: Awaited<ReturnType<typeof clerkClient.users.getUser>>;
  try {
    clerkUser = await clerkClient.users.getUser(clerkUserId);
  } catch (err) {
    logger.error({ err, clerkUserId }, "[family-invites] Clerk user lookup failed");
    res.status(500).json({ error: "Could not verify your identity. Please try again." });
    return;
  }

  // Verify that at least one of the Clerk user's email addresses matches the invited email
  const clerkEmails = clerkUser.emailAddresses.map((e) => e.emailAddress.toLowerCase());
  if (!clerkEmails.includes(invite.email.toLowerCase())) {
    res.status(403).json({
      error: "This invite was sent to a different email address. Please sign in with the email that received the invite.",
      invitedEmail: invite.email,
    });
    return;
  }

  // Get the primary email to use for the user record
  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@trailtribe.app`;
  const firstName = clerkUser.firstName ?? "New";
  const lastName = clerkUser.lastName ?? "User";

  // Get or create the user record and mark them approved
  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (user) {
    const [updated] = await db.update(usersTable)
      .set({ approved: true })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated ?? user;
  } else {
    // Check if a stub user exists by email
    const byEmail = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, primaryEmail),
    });
    if (byEmail) {
      const [updated] = await db.update(usersTable)
        .set({ clerkUserId, approved: true })
        .where(eq(usersTable.id, byEmail.id))
        .returning();
      user = updated ?? byEmail;
    } else {
      const [created] = await db.insert(usersTable).values({
        clerkUserId,
        firstName,
        lastName,
        email: primaryEmail,
        role: "parent",
        approved: true,
        notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
      }).returning();
      user = created ?? null;
    }
  }

  // Guard: only consume the invite after user creation/update succeeded
  if (!user) {
    logger.error({ clerkUserId, inviteId: invite.id }, "[family-invites] user creation failed; invite NOT consumed");
    res.status(500).json({ error: "Failed to set up your account. Please try again." });
    return;
  }

  // Mark invite accepted — only reached after successful user creation/approval
  await db.update(familyInvitesTable)
    .set({ acceptedAt: now })
    .where(eq(familyInvitesTable.id, invite.id));

  res.json({ ok: true, autoApproved: true });
});

export default router;
