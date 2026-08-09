import { Router } from "express";
import { db } from "@workspace/db";
import { teamDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  ObjectAccessGroupType,
  ObjectPermission,
  storePendingObjectAcl,
} from "../lib/objectAcl";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;
const storage = new ObjectStorageService();

const BASE_URL = process.env.BASE_URL || "";

router.get("/team-documents", async (_req, res) => {
  const docs = await db.select().from(teamDocumentsTable);
  const docsWithUrls = docs.map((doc) => ({
    ...doc,
    viewUrl: doc.objectPath
      ? `${BASE_URL}/api/storage${doc.objectPath}`
      : doc.externalUrl ?? null,
  }));
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

export default router;
