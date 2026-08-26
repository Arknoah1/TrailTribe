import { Router } from "express";
import { db } from "@workspace/db";
import {
  teamDocumentsTable,
  documentConsentsTable,
  householdsTable,
  usersTable,
  seasonsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, inArray, or, lt } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  ObjectAccessGroupType,
  ObjectPermission,
  storePendingObjectAcl,
} from "../lib/objectAcl";
import { sendEmail } from "../lib/email";
import { getAppBase } from "../lib/config";
import { logger } from "../lib/logger";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;
const storage = new ObjectStorageService();

const BASE_URL = process.env.BASE_URL || "";
/** Public-facing frontend URL used in email links (e.g. https://trailteam.app). */
const APP_URL = process.env.APP_URL || getAppBase() || BASE_URL;

router.get("/team-documents", async (_req, res) => {
  const docs = await db.select().from(teamDocumentsTable);

  // Compute how many non-archived households haven't signed each active document.
  // Mirrors the same version string used in the compliance check: `type@vN`.
  const [activeSeason] = await db
    .select({ id: seasonsTable.id })
    .from(seasonsTable)
    .where(eq(seasonsTable.status, "active"))
    .orderBy(desc(seasonsTable.id))
    .limit(1);
  const activeSeasonId = activeSeason?.id ?? null;

  const activeHouseholds = await db
    .select({ id: householdsTable.id })
    .from(householdsTable)
    .where(isNull(householdsTable.archivedAt));
  const totalActive = activeHouseholds.length;
  const activeHouseholdIds = new Set(activeHouseholds.map((h) => h.id));

  // Fetch all consent rows once and group by document type
  const allConsents = await db
    .select({
      householdId: documentConsentsTable.householdId,
      documentType: documentConsentsTable.documentType,
      documentVersion: documentConsentsTable.documentVersion,
      seasonId: documentConsentsTable.seasonId,
    })
    .from(documentConsentsTable);

  const docsWithUrls = docs.map((doc) => {
    const viewUrl = doc.objectPath
      ? `${BASE_URL}/api/storage${doc.objectPath}`
      : doc.externalUrl ?? null;

    let unsignedCount: number | null = null;
    if (viewUrl) {
      const currentVersion = `${doc.type}@v${doc.versionNumber}`;
      const signedHouseholdIds = new Set(
        allConsents
          .filter(
            (c) =>
              c.documentType === doc.type &&
              c.documentVersion === currentVersion &&
              c.seasonId === activeSeasonId &&
              activeHouseholdIds.has(c.householdId),
          )
          .map((c) => c.householdId),
      );
      unsignedCount = totalActive - signedHouseholdIds.size;
    }

    return { ...doc, viewUrl, unsignedCount };
  });

  res.json(docsWithUrls);
});

router.put("/team-documents/:type", requireCoachOrAdmin, async (req, res) => {
  const type = str(req.params.type);
  const { label, description, objectPath, externalUrl, mimeType, originalName } = req.body;

  const validTypes = ["liability_waiver", "media_release", "code_of_conduct"] as const;
  if (!validTypes.includes(type as any)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  const existing = await db.query.teamDocumentsTable.findFirst({
    where: eq(teamDocumentsTable.type, type as any),
  });

  if (existing) {
    // Increment the version counter whenever the actual document content changes
    // (new storage path or new external URL), so consent records remain tied to
    // the exact content that was accepted even if content is replaced at the same path.
    const newObjectPath = objectPath !== undefined ? objectPath : existing.objectPath;
    const newExternalUrl = externalUrl !== undefined ? externalUrl : existing.externalUrl;
    const contentChanging =
      newObjectPath !== existing.objectPath || newExternalUrl !== existing.externalUrl;

    const [updated] = await db
      .update(teamDocumentsTable)
      .set({
        label: label ?? existing.label,
        description: description ?? existing.description,
        objectPath: newObjectPath,
        externalUrl: newExternalUrl,
        mimeType: mimeType ?? existing.mimeType,
        originalName: originalName !== undefined ? originalName : existing.originalName,
        versionNumber: contentChanging ? existing.versionNumber + 1 : existing.versionNumber,
      })
      .where(eq(teamDocumentsTable.type, type as any))
      .returning();
    const viewUrl = updated.objectPath
      ? `${BASE_URL}/api/storage${updated.objectPath}`
      : updated.externalUrl ?? null;
    res.json({ ...updated, viewUrl });

    // Notify unsigned families after the response is sent (fire-and-forget)
    if (contentChanging && viewUrl) {
      notifyUnsignedFamilies(updated.type, updated.label, updated.versionNumber).catch(
        (err) => logger.error({ err }, "[team-documents] notification send failed"),
      );
    }
  } else {
    const [created] = await db
      .insert(teamDocumentsTable)
      .values({
        type: type as any,
        label: label ?? type.replace(/_/g, " "),
        description: description ?? null,
        objectPath: objectPath ?? null,
        externalUrl: externalUrl ?? null,
        mimeType: mimeType ?? null,
        originalName: originalName ?? null,
      })
      .returning();
    const viewUrl = created.objectPath
      ? `${BASE_URL}/api/storage${created.objectPath}`
      : created.externalUrl ?? null;
    res.status(201).json({ ...created, viewUrl });

    // Notify all families when a brand-new document with content is created
    if (viewUrl) {
      notifyUnsignedFamilies(created.type, created.label, created.versionNumber).catch(
        (err) => logger.error({ err }, "[team-documents] notification send failed"),
      );
    }
  }
});

// Soft-delete: clear the file reference and increment the version counter so that
// any existing consent records for the old URL cannot satisfy future re-enrollment.
// The row itself is retained to preserve the version history.
router.delete("/team-documents/:type", requireCoachOrAdmin, async (req, res) => {
  const type = str(req.params.type);

  const existing = await db.query.teamDocumentsTable.findFirst({
    where: eq(teamDocumentsTable.type, type as any),
  });
  if (!existing) { res.status(404).json({ error: "Document type not found" }); return; }

  await db
    .update(teamDocumentsTable)
    .set({
      objectPath: null,
      externalUrl: null,
      mimeType: null,
      originalName: null,
      // Bump the version so any prior URL-based consents are invalidated
      versionNumber: existing.versionNumber + 1,
    })
    .where(eq(teamDocumentsTable.type, type as any));

  res.status(204).send();
});

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /team-documents/:type/notify-unsigned
 *
 * Manually trigger a reminder email to all households that haven't yet signed
 * the current version of a document.  A 24-hour cooldown prevents accidental
 * spam — the endpoint returns 429 with a cooldownUntil timestamp if the last
 * blast was within the window.
 *
 * The cooldown is acquired atomically: the UPDATE only succeeds when
 * last_notified_at is NULL or older than 24 hours, so concurrent requests
 * cannot both slip past the check.
 */
router.post("/team-documents/:type/notify-unsigned", requireCoachOrAdmin, async (req, res) => {
  const type = str(req.params.type);
  const validTypes = ["liability_waiver", "media_release", "code_of_conduct"] as const;
  if (!validTypes.includes(type as any)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  const doc = await db.query.teamDocumentsTable.findFirst({
    where: eq(teamDocumentsTable.type, type as any),
  });

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const viewUrl = doc.objectPath
    ? `${BASE_URL}/api/storage${doc.objectPath}`
    : doc.externalUrl ?? null;

  if (!viewUrl) {
    res.status(400).json({ error: "Document has no file or URL set" });
    return;
  }

  // Atomic cooldown acquisition: only update (and thus proceed) if the cooldown
  // window has elapsed.  Two concurrent requests both seeing an expired timestamp
  // will race on this UPDATE — only one will match and get a row back; the other
  // gets an empty RETURNING and returns 429.
  const cooldownCutoff = new Date(Date.now() - NOTIFY_COOLDOWN_MS);
  const acquired = await db
    .update(teamDocumentsTable)
    .set({ lastNotifiedAt: new Date() })
    .where(
      and(
        eq(teamDocumentsTable.type, type as any),
        or(
          isNull(teamDocumentsTable.lastNotifiedAt),
          lt(teamDocumentsTable.lastNotifiedAt, cooldownCutoff),
        ),
      ),
    )
    .returning();

  if (acquired.length === 0) {
    // Cooldown still active — fetch the current timestamp so we can compute
    // how long is left (the doc was re-read above so we already have it).
    const lastNotifiedAt = doc.lastNotifiedAt ? new Date(doc.lastNotifiedAt) : null;
    const cooldownUntil = lastNotifiedAt
      ? new Date(lastNotifiedAt.getTime() + NOTIFY_COOLDOWN_MS)
      : null;
    const remainingMs = cooldownUntil ? cooldownUntil.getTime() - Date.now() : 0;
    const remainingHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
    res.status(429).json({
      error: `A reminder was already sent within the last 24 hours. Please wait ${remainingHours} more ${remainingHours === 1 ? "hour" : "hours"} before sending another.`,
      cooldownUntil: cooldownUntil?.toISOString() ?? null,
    });
    return;
  }

  res.json({ queued: true });

  // Fire-and-forget notification (after response is sent)
  notifyUnsignedFamilies(doc.type, doc.label, doc.versionNumber).catch(
    (err) => logger.error({ err }, "[team-documents] manual notify-unsigned failed"),
  );
});

/**
 * POST /team-documents/upload-url
 *
 * Generates a presigned PUT URL for a team document upload.
 * Team documents are coach/admin resources readable by the whole team, so the
 * ACL policy grants AUTHENTICATED_USER read access.  The policy is persisted
 * to the DB before the URL is returned — if that write fails the request fails
 * so the upload URL is never handed out without a recorded policy.
 */
router.post("/team-documents/upload-url", requireCoachOrAdmin, async (req, res) => {
  try {
    const clerkUserId = (req as any).clerkUserId as string;

    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);

    // Team documents are managed by coaches/admins and visible to all team
    // members — grant team-wide read access.
    await storePendingObjectAcl(objectPath, {
      owner: clerkUserId,
      visibility: "private",
      aclRules: [
        {
          group: { type: ObjectAccessGroupType.AUTHENTICATED_USER, id: "all" },
          permission: ObjectPermission.READ,
        },
      ],
    });

    res.json({ uploadURL, objectPath });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * Fire-and-forget helper: finds all non-archived households that have NOT yet
 * signed a given document version and emails each household's users a prompt
 * to open Profile → My Family → Season Documents to sign.
 */
async function notifyUnsignedFamilies(
  docType: string,
  docLabel: string,
  versionNumber: number,
): Promise<void> {
  const currentVersion = `${docType}@v${versionNumber}`;
  const profileUrl = `${APP_URL}/profile?tab=family`;

  // Run these two queries in parallel — they're independent
  const [[activeSeason], activeHouseholds] = await Promise.all([
    db
      .select({ id: seasonsTable.id })
      .from(seasonsTable)
      .where(eq(seasonsTable.status, "active"))
      .orderBy(desc(seasonsTable.id))
      .limit(1),
    db
      .select({ id: householdsTable.id })
      .from(householdsTable)
      .where(isNull(householdsTable.archivedAt)),
  ]);

  if (activeHouseholds.length === 0) return;

  const activeSeasonId = activeSeason?.id ?? null;

  // Find households that already have a valid consent for this version + season
  const signedRows = await db
    .select({ householdId: documentConsentsTable.householdId })
    .from(documentConsentsTable)
    .where(
      and(
        eq(documentConsentsTable.documentType, docType as any),
        eq(documentConsentsTable.documentVersion, currentVersion),
        activeSeasonId !== null
          ? eq(documentConsentsTable.seasonId, activeSeasonId)
          : isNull(documentConsentsTable.seasonId),
      ),
    );
  const signedSet = new Set(signedRows.map((r) => r.householdId));

  const unsignedHouseholdIds = activeHouseholds
    .map((h) => h.id)
    .filter((id) => !signedSet.has(id));

  if (unsignedHouseholdIds.length === 0) {
    logger.info({ docType, currentVersion }, "[team-documents] all families already signed — no emails sent");
    return;
  }

  // Fetch all users belonging to unsigned households in one query.
  // Include role and emailNotifications so we can filter recipients correctly.
  const householdUsers = await db
    .select({
      email: usersTable.email,
      householdId: usersTable.householdId,
      role: usersTable.role,
      emailNotifications: usersTable.emailNotifications,
    })
    .from(usersTable)
    .where(inArray(usersTable.householdId, unsignedHouseholdIds));

  const emailTargets = householdUsers.filter(
    (u) =>
      // Adults only — riders/students should not receive compliance emails
      u.role !== "student" &&
      // Respect the user's email notification opt-out
      u.emailNotifications !== false &&
      u.email &&
      !u.email.endsWith("@trailtribe.internal") &&
      !u.email.endsWith("@pending.trailtribe.app"),
  );

  if (emailTargets.length === 0) {
    logger.info({ docType }, "[team-documents] no email recipients found for unsigned families");
    return;
  }

  logger.info(
    { docType, unsignedCount: unsignedHouseholdIds.length, recipientCount: emailTargets.length },
    "[team-documents] sending compliance document notifications",
  );

  const subject = `Action required: Please review and sign the ${docLabel}`;
  const body = [
    `Hi there,`,
    ``,
    `Your team has updated the ${docLabel} and your signature is required.`,
    ``,
    `Please log in to TrailTeam and go to Profile → My Family → Season Documents to review and sign the document.`,
    ...(APP_URL ? [``, `Sign now: ${profileUrl}`] : []),
    ``,
    `If you have already signed this document, no further action is needed.`,
    ``,
    `— The TrailTeam`,
  ].join("\n");

  // Send individually so each recipient sees their own To: address
  for (const target of emailTargets) {
    await sendEmail({ to: target.email, subject, text: body });
  }

  logger.info(
    { docType, recipientCount: emailTargets.length },
    "[team-documents] compliance notifications sent",
  );
}

export default router;
