import { File } from "@google-cloud/storage";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

/**
 * AUTHENTICATED_USER — any user with a valid Clerk session (team-wide access).
 * HOUSEHOLD_MEMBER   — any user whose householdId matches the group id.
 */
export enum ObjectAccessGroupType {
  AUTHENTICATED_USER = "AUTHENTICATED_USER",
  HOUSEHOLD_MEMBER = "HOUSEHOLD_MEMBER",
}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a user-list DB id, an email domain, a group id.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// Stored as object custom metadata under "custom:aclPolicy" (JSON string).
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

/**
 * Matches any authenticated user — used to grant team-wide read access for
 * coach/admin uploads.
 */
class AuthenticatedUserAccessGroup extends BaseObjectAccessGroup {
  constructor() {
    super(ObjectAccessGroupType.AUTHENTICATED_USER, "all");
  }

  public async hasMember(userId: string): Promise<boolean> {
    return userId != null && userId.length > 0;
  }
}

/**
 * Matches any user whose householdId equals the group id — used to restrict
 * parent uploads to their own household.
 */
class HouseholdMemberAccessGroup extends BaseObjectAccessGroup {
  constructor(householdId: string) {
    super(ObjectAccessGroupType.HOUSEHOLD_MEMBER, householdId);
  }

  public async hasMember(userId: string): Promise<boolean> {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.clerkUserId, userId),
    });
    if (!user || user.householdId == null) {
      return false;
    }
    return String(user.householdId) === this.id;
  }
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    case ObjectAccessGroupType.AUTHENTICATED_USER:
      return new AuthenticatedUserAccessGroup();
    case ObjectAccessGroupType.HOUSEHOLD_MEMBER:
      return new HouseholdMemberAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// ---------------------------------------------------------------------------
// Durable ACL store (Postgres)
//
// GCS does not allow setting metadata on an object that does not yet exist.
// When a presigned upload URL is requested we store the intended policy in
// the `object_acl_policies` DB table (created by the migration).  The table
// survives server restarts and works across multiple server instances.
//
// On the first download the policy is also written to the GCS object's custom
// metadata so subsequent reads can skip the DB query.
// ---------------------------------------------------------------------------

/**
 * Persist an ACL policy for an object path that may not exist in GCS yet.
 * Called at upload-URL-request time.
 */
export async function storePendingObjectAcl(
  objectPath: string,
  policy: ObjectAclPolicy,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO object_acl_policies (object_path, policy)
       VALUES ($1, $2)
       ON CONFLICT (object_path) DO UPDATE SET policy = EXCLUDED.policy`,
      [objectPath, JSON.stringify(policy)],
    );
  } finally {
    client.release();
  }
}

async function getDbObjectAclPolicy(
  objectPath: string,
): Promise<ObjectAclPolicy | null> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ policy: ObjectAclPolicy }>(
      `SELECT policy FROM object_acl_policies WHERE object_path = $1`,
      [objectPath],
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].policy;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Core ACL helpers
// ---------------------------------------------------------------------------

export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

/**
 * Returns the ACL policy for an object, checking:
 *   1. GCS object custom metadata (fastest path after first download)
 *   2. Postgres `object_acl_policies` table (durable fallback for newly
 *      uploaded objects whose metadata hasn't been written yet)
 *
 * When the policy is found in the DB but not on the object, it is lazily
 * persisted to GCS metadata so future calls hit the fast path.
 */
export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  // 1. Check GCS metadata (fast path).
  const [metadata] = await objectFile.getMetadata();
  const raw = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (raw) {
    return JSON.parse(raw as string);
  }

  // 2. Fall back to the DB store.
  // objectFile.name is the GCS object name e.g. "uploads/<uuid>".
  // The DB key uses the normalised path "/objects/<name>".
  const objectPath = `/objects/${objectFile.name}`;
  const dbPolicy = await getDbObjectAclPolicy(objectPath);
  if (!dbPolicy) {
    return null;
  }

  // 3. Lazily promote the policy to GCS metadata so subsequent reads are fast.
  try {
    await setObjectAclPolicy(objectFile, dbPolicy);
  } catch {
    // Object may not exist yet in edge cases — that's fine, we already have
    // the policy from the DB and will return it below.
  }

  return dbPolicy;
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
