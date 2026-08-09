import { Router } from "express";
import { createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { teamSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCoachOrAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { z } from "zod";

const router = Router();

async function getOrCreateSettings() {
  const existing = await db.query.teamSettingsTable.findFirst({
    where: eq(teamSettingsTable.id, 1),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(teamSettingsTable)
    .values({ id: 1, teamName: "", shortName: "" })
    .onConflictDoNothing()
    .returning();
  // If onConflictDoNothing returned nothing, re-fetch
  return created ?? (await db.query.teamSettingsTable.findFirst({ where: eq(teamSettingsTable.id, 1) }))!;
}

/**
 * Returns a subject-line prefix like "Methow Cycling: " when a short name is
 * configured, or "" when it isn't. Use it as:
 *   subject: `${await getShortNamePrefix()}Your actual subject here`
 */
async function getShortNamePrefix(): Promise<string> {
  const settings = await getOrCreateSettings();
  const short = settings.shortName?.trim();
  return short ? `${short}: ` : "";
}

// GET /settings — return current team settings (coach/admin)
router.get("/settings", requireCoachOrAdmin, async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json({
    teamName: settings.teamName ?? "",
    shortName: settings.shortName ?? "",
  });
});

const updateSettingsSchema = z.object({
  teamName: z.string().max(100),
  shortName: z.string().max(60),
});

// PUT /settings — update team settings (coach/admin)
router.put("/settings", requireCoachOrAdmin, async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  // Upsert row id=1
  const [updated] = await db
    .insert(teamSettingsTable)
    .values({ id: 1, teamName: parsed.data.teamName, shortName: parsed.data.shortName })
    .onConflictDoUpdate({
      target: teamSettingsTable.id,
      set: { teamName: parsed.data.teamName, shortName: parsed.data.shortName },
    })
    .returning();

  res.json({
    teamName: updated?.teamName ?? parsed.data.teamName,
    shortName: updated?.shortName ?? parsed.data.shortName,
  });
});

// DELETE /admin/cleanup/clerk-by-email — remove a Clerk account by email address.
// Safety valve for when automated Clerk deletion silently fails during household deletion.
// Refuses to delete if an active DB user row is still linked to that Clerk account.
router.delete("/admin/cleanup/clerk-by-email", requireCoachOrAdmin, async (req, res) => {
  const bodySchema = z.object({ email: z.string().email("A valid email address is required") });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    return;
  }
  const { email } = parsed.data;

  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  // Look up the Clerk user by email
  let clerkUserId: string | null = null;
  try {
    const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email] });
    if (!users || users.length === 0) {
      res.status(404).json({ error: `No sign-in account found for ${email}. The email may already be available, or it may belong to a social login (Google). Check your Clerk dashboard if you need to verify.` });
      return;
    }
    clerkUserId = users[0].id;
  } catch (err) {
    logger.error({ err, email }, "[cleanup] Clerk user lookup failed");
    res.status(502).json({ error: "Could not reach the authentication service. Please try again." });
    return;
  }

  // Safety guard — refuse if an active DB user is still linked to this Clerk account
  const activeUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (activeUser) {
    res.status(409).json({
      error: `This account belongs to an active TrailTribe user (${activeUser.firstName} ${activeUser.lastName}). Remove or archive the family first before clearing their sign-in account.`,
    });
    return;
  }

  // Delete the Clerk account
  try {
    await clerkClient.users.deleteUser(clerkUserId);
    logger.info({ email, clerkUserId }, "[cleanup] Clerk account manually deleted by admin");
    res.json({ ok: true, message: `Sign-in account for ${email} has been removed. They can now re-register.` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, email, clerkUserId }, "[cleanup] Clerk user deletion failed");
    res.status(502).json({ error: `Deletion failed: ${msg}` });
  }
});

export { getOrCreateSettings, getShortNamePrefix };
export default router;
