import { Router } from "express";
import { db } from "@workspace/db";
import { teamDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";

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

router.put("/team-documents/:type", requireAuth, async (req, res) => {
  const type = str(req.params.type);
  const { label, description, objectPath, externalUrl, mimeType } = req.body;

  const validTypes = ["liability_waiver", "media_release", "code_of_conduct"] as const;
  if (!validTypes.includes(type as any)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  const existing = await db.query.teamDocumentsTable.findFirst({
    where: eq(teamDocumentsTable.type, type as any),
  });

  if (existing) {
    const [updated] = await db
      .update(teamDocumentsTable)
      .set({
        label: label ?? existing.label,
        description: description ?? existing.description,
        objectPath: objectPath !== undefined ? objectPath : existing.objectPath,
        externalUrl: externalUrl !== undefined ? externalUrl : existing.externalUrl,
        mimeType: mimeType ?? existing.mimeType,
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
      })
      .returning();
    const viewUrl = created.objectPath
      ? `${BASE_URL}/api/storage${created.objectPath}`
      : created.externalUrl ?? null;
    res.status(201).json({ ...created, viewUrl });
  }
});

router.delete("/team-documents/:type", requireAuth, async (req, res) => {
  const type = str(req.params.type);
  await db.delete(teamDocumentsTable).where(eq(teamDocumentsTable.type, type as any));
  res.status(204).send();
});

router.post("/team-documents/upload-url", requireAuth, async (req, res) => {
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
