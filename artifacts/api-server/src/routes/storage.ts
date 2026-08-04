import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  ObjectPermission,
  ObjectAccessGroupType,
  canAccessObject,
  getObjectAclPolicy,
  storePendingObjectAcl,
  type ObjectAclPolicy,
} from "../lib/objectAcl";
import { requireAuth } from "../middlewares/requireAuth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * An ACL policy is stored immediately so that when the file is first downloaded
 * the access check enforces the right ownership/visibility rules:
 *  - coach/admin → private visibility, team-wide read via AUTHENTICATED_USER group
 *  - parent/student → private visibility, household-scoped read via HOUSEHOLD_MEMBER group
 *    (or owner-only if the user has no household)
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const clerkUserId = (req as any).clerkUserId as string;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    // Look up the uploading user to determine ACL scope.
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.clerkUserId, clerkUserId),
    });

    let aclPolicy: ObjectAclPolicy;

    if (user && (user.role === "coach" || user.role === "admin")) {
      // Coach/admin uploads are readable by the whole team.
      aclPolicy = {
        owner: clerkUserId,
        visibility: "private",
        aclRules: [
          {
            group: { type: ObjectAccessGroupType.AUTHENTICATED_USER, id: "all" },
            permission: ObjectPermission.READ,
          },
        ],
      };
    } else if (user && user.householdId != null) {
      // Parent/student uploads are readable by their household members only.
      aclPolicy = {
        owner: clerkUserId,
        visibility: "private",
        aclRules: [
          {
            group: {
              type: ObjectAccessGroupType.HOUSEHOLD_MEMBER,
              id: String(user.householdId),
            },
            permission: ObjectPermission.READ,
          },
        ],
      };
    } else {
      // Fallback: owner-only access.
      aclPolicy = {
        owner: clerkUserId,
        visibility: "private",
        aclRules: [],
      };
    }

    // Persist the policy durably before handing out the upload URL.
    // If this fails we must not return the URL — the file would otherwise
    // become permanently unreadable (fail-closed path in the download handler).
    await storePendingObjectAcl(objectPath, aclPolicy);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Objects under /objects/uploads/* are user-uploaded files that always
    // carry an ACL policy set at upload time.  If no policy is found (neither
    // in GCS metadata nor in the DB), deny access rather than falling open.
    //
    // Objects under other paths (e.g. team documents, trailhead photos) are
    // team resources without per-user ACLs — they remain accessible to any
    // authenticated user.
    const isUserUpload = wildcardPath.startsWith("uploads/");
    const aclPolicy = await getObjectAclPolicy(objectFile);

    if (aclPolicy) {
      const clerkUserId = (req as any).clerkUserId as string;
      const allowed = await canAccessObject({
        userId: clerkUserId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (isUserUpload) {
      // No ACL found for a user-uploaded file — fail closed.
      req.log.warn({ objectPath }, "User-uploaded object has no ACL policy; denying access");
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
