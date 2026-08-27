import { Router } from "express";
import { createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { teamSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCoachOrAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { z } from "zod";
import { deleteClerkUserId, permanentlyDeleteLocalAccount } from "../lib/account-deletion";

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

const deleteAccountByEmailSchema = z.object({
  email: z.string().trim().email("A valid email address is required"),
  confirmation: z.literal("DELETE"),
}).strict();

async function permanentlyDeleteAccountByEmail(req: any, res: any): Promise<void> {
  const parsed = deleteAccountByEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address and type DELETE to confirm permanent deletion." });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const activeUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (activeUser) {
    // Coaches may manage member accounts, but only an administrator can delete
    // another administrator. A signed-in administrator must use their own
    // Profile deletion control so the stronger self-service confirmation is
    // always shown.
    if (activeUser.role === "admin") {
      const requester = await db.query.usersTable.findFirst({
        where: eq(usersTable.clerkUserId, req.clerkUserId),
      });
      if (requester?.id === activeUser.id) {
        res.status(403).json({ error: "Use your Profile page to permanently delete your own administrator account." });
        return;
      }
      if (requester?.role !== "admin") {
        res.status(403).json({ error: "Only an administrator can permanently delete another administrator account." });
        return;
      }

      const administrators = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"));
      if (administrators.length <= 1) {
        res.status(409).json({ error: "The last administrator cannot be removed from the admin tool. They can delete their own account from Profile after arranging team ownership." });
        return;
      }
    }

    const result = await permanentlyDeleteLocalAccount(activeUser);
    if (!result.ok) {
      if (result.stage === "clerk") {
        res.status(502).json({ error: "The sign-in service could not be reached. No TrailTeam data was deleted; please try again." });
        return;
      }
      res.status(500).json({ error: "The sign-in account was removed, but TrailTeam data could not be deleted. Run this deletion again to finish safely." });
      return;
    }

    res.json({
      ok: true,
      deletedHousehold: result.deletedHousehold,
      message: `Account for ${email} was permanently deleted. This email can now register again.`,
    });
    return;
  }

  // Keep support for an account that reached Clerk but never created a local
  // TrailTeam profile. This is also useful for completing a partial deletion.
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  let clerkUserId: string | null = null;
  try {
    const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email] });
    clerkUserId = users?.[0]?.id ?? null;
  } catch (error) {
    logger.error({ err: error, email }, "Clerk user lookup failed during permanent account deletion");
    res.status(502).json({ error: "Could not reach the sign-in service. Please try again." });
    return;
  }

  if (!clerkUserId) {
    res.status(404).json({ error: `No TrailTeam account was found for ${email}. The email may already be available.` });
    return;
  }

  const clerkDeleted = await deleteClerkUserId(clerkUserId);
  if (!clerkDeleted) {
    res.status(502).json({ error: "The sign-in service could not remove this account. No TrailTeam data was deleted; please try again." });
    return;
  }

  logger.info({ email, clerkUserId }, "Permanently deleted orphaned Clerk account");
  res.json({
    ok: true,
    deletedHousehold: false,
    message: `Sign-in account for ${email} was permanently deleted. This email can now register again.`,
  });
}

// DELETE /admin/accounts/by-email — permanently delete an active TrailTeam
// account or an orphaned authentication account selected by its email.
router.delete("/admin/accounts/by-email", requireCoachOrAdmin, permanentlyDeleteAccountByEmail);

// Backwards-compatible endpoint for prior recovery links. It now performs the
// complete permanent deletion flow rather than refusing active accounts.
router.delete("/admin/cleanup/clerk-by-email", requireCoachOrAdmin, permanentlyDeleteAccountByEmail);

export { getOrCreateSettings, getShortNamePrefix };
export default router;
