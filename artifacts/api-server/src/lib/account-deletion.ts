import { createClerkClient } from "@clerk/express";
import {
  db,
  documentConsentsTable,
  familyInvitesTable,
  householdsTable,
  seasonRosterSnapshotsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

type LocalUser = typeof usersTable.$inferSelect;

export type AccountDeletionResult =
  | { ok: true; deletedHousehold: boolean }
  | { ok: false; stage: "clerk" | "database" };

function isMissingClerkUser(error: unknown): boolean {
  const status = (error as { status?: unknown; statusCode?: unknown })?.status
    ?? (error as { statusCode?: unknown })?.statusCode;
  if (status === 404) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /user.*not found|not found.*user|does not exist/i.test(message);
}

/**
 * Removes a Clerk identity. A missing identity is success so a previous,
 * partially completed deletion can be safely retried from the admin tool.
 */
export async function deleteClerkUserId(clerkUserId: string | null): Promise<boolean> {
  if (!clerkUserId) return true;

  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.users.deleteUser(clerkUserId);
    return true;
  } catch (error) {
    if (isMissingClerkUser(error)) return true;
    logger.error({ err: error, clerkUserId }, "Could not delete Clerk account");
    return false;
  }
}

/**
 * Deletes exactly one local account and its Clerk identity. User-owned
 * operational data is removed by database cascades; shared history that has
 * SET NULL foreign keys remains anonymous rather than removing other members'
 * work. If this was the last member of a household, the household-only records
 * are removed too.
 */
export async function permanentlyDeleteLocalAccount(user: LocalUser): Promise<AccountDeletionResult> {
  const clerkDeleted = await deleteClerkUserId(user.clerkUserId);
  if (!clerkDeleted) return { ok: false, stage: "clerk" };

  try {
    let deletedHousehold = false;
    const anonymizedClerkId = `deleted-account-${randomUUID()}`;

    await db.transaction(async (tx) => {
      let isLastHouseholdMember = false;
      if (user.householdId !== null) {
        const members = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.householdId, user.householdId));
        isLastHouseholdMember = members.every((member) => member.id === user.id);
      }

      // Consent records are legal/audit evidence, but the Clerk identifier,
      // IP address, and user agent are personal data and must not remain.
      if (user.clerkUserId) {
        await tx
          .update(documentConsentsTable)
          .set({ clerkUserId: anonymizedClerkId, ipAddress: null, userAgent: null })
          .where(eq(documentConsentsTable.clerkUserId, user.clerkUserId));
        await tx
          .update(familyInvitesTable)
          .set({ acceptedByClerkUserId: null })
          .where(eq(familyInvitesTable.acceptedByClerkUserId, user.clerkUserId));
      }

      // All direct user references either cascade their personal records or
      // SET NULL on shared team records such as events and board discussions.
      await tx.delete(usersTable).where(eq(usersTable.id, user.id));

      if (user.householdId !== null && isLastHouseholdMember) {
        await tx.delete(documentConsentsTable).where(eq(documentConsentsTable.householdId, user.householdId));
        await tx.delete(seasonRosterSnapshotsTable).where(eq(seasonRosterSnapshotsTable.householdId, user.householdId));
        await tx.delete(householdsTable).where(eq(householdsTable.id, user.householdId));
        deletedHousehold = true;
      }
    });

    logger.info({ userId: user.id, deletedHousehold }, "Permanently deleted local account");
    return { ok: true, deletedHousehold };
  } catch (error) {
    // The Clerk identity has already been removed. The remaining local row is
    // deliberately retained so an administrator can safely retry by email.
    logger.error({ err: error, userId: user.id }, "Local account deletion failed after Clerk deletion");
    return { ok: false, stage: "database" };
  }
}