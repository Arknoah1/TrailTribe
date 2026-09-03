import { Router } from "express";
import { createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  householdsTable,
  usersTable,
  familyInvitesTable,
  documentConsentsTable,
  teamDocumentsTable,
  seasonsTable,
  seasonRosterSnapshotsTable,
  carpoolClaimsTable,
  carpoolOffersTable,
  carpoolRequestsTable,
  notificationsTable,
  eventTaskSignupsTable,
  boardThreadsTable,
  boardPostsTable,
  riderInvitesTable,
  householdAdminAuditTable,
  broadcastsTable,
  eventRsvpsTable,
  eventsTable,
  rsvpEmailBatchesTable,
  pushDevicesTable,
  boardReactionsTable,
  inviteLinksTable,
  podsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, gt, inArray, or } from "drizzle-orm";
import { SendCoParentInviteBody, SendCoParentInviteParams } from "@workspace/api-zod";
import { requireAuth, requireApproved, requireCoachOrAdmin, requireAdmin } from "../middlewares/requireAuth";
import { publicLookupLimiter } from "../middlewares/rateLimiter";
import { randomBytes } from "crypto";
import { z } from "zod";
import { sendEmail } from "../lib/email";
import { getAppBase } from "../lib/config";
import { permanentlyDeleteLocalAccount } from "../lib/account-deletion";
import { addEmailLinks, buildAppUrl } from "../lib/emailLinks";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const studentNotifPrefsSchema = z.object({
  practiceReminders: z.boolean(),
  coachMessages: z.boolean(),
  eventReminders: z.boolean(),
}).partial();

const CO_PARENT_INVITE_TTL_DAYS = 7;

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

function coParentInviteExpiresAt(): Date {
  const date = new Date();
  date.setDate(date.getDate() + CO_PARENT_INVITE_TTL_DAYS);
  return date;
}

const createHouseholdSchema = z.object({
  name: z.string().min(1, "Family name is required"),
  podId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
});

const updateHouseholdSchema = createHouseholdSchema.partial();

const adminHouseholdPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(30).nullable().optional(),
  podId: z.string().max(100).nullable().optional(),
}).strict();

const adminAdultMemberPatchSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
}).strict();

const adminStudentMemberPatchSchema = adminAdultMemberPatchSchema.extend({
  grade: z.number().int().min(-1).max(20).nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  allergies: z.string().max(10_000).nullable().optional(),
  medications: z.string().max(10_000).nullable().optional(),
  medicalNotes: z.string().max(10_000).nullable().optional(),
}).strict();

const confirmationSchema = z.object({ confirmation: z.literal(true) }).strict();
const reclassifySchema = confirmationSchema.extend({ role: z.enum(["parent", "student"]) }).strict();
const moveSchema = confirmationSchema.extend({ targetHouseholdId: z.number().int().positive() }).strict();

// ── Medical-field privacy helpers ──────────────────────────────────────────
const MEDICAL_FIELDS = ["allergies", "medications", "medicalNotes"] as const;

function stripMedical<T>(user: T): T {
  const u = { ...(user as Record<string, unknown>) };
  for (const f of MEDICAL_FIELDS) delete u[f];
  return u as T;
}

function shapeMedical<T>(user: T, canSee: boolean): T {
  return canSee ? user : stripMedical(user);
}

/**
 * Household member responses may tell authorized viewers whether a rider has
 * linked an app account, but must never expose the underlying Clerk subject.
 */
function shapeHouseholdMember<T extends { clerkUserId?: string | null }>(
  user: T,
  canSeeMedicalFields: boolean,
) {
  const shaped = shapeMedical(user, canSeeMedicalFields);
  const { clerkUserId, ...safeUser } = shaped;
  return { ...safeUser, hasAppAccess: Boolean(clerkUserId) };
}

function safeAdminMember(user: typeof usersTable.$inferSelect) {
  // Admin correction responses deliberately have the same identity boundary as
  // household reads. Clerk identities are never a client-side correction tool.
  return shapeHouseholdMember(user, true);
}

function isResponsibleAdult(user: { role: string }) {
  return user.role === "parent" || user.role === "coach";
}

async function writeHouseholdAdminAudit(
  tx: any,
  administratorUserId: number,
  action: string,
  householdId: number | null,
  memberId: number | null,
  before: unknown,
  after: unknown,
) {
  await tx.insert(householdAdminAuditTable).values({
    administratorUserId,
    householdId,
    memberId,
    action,
    before,
    after,
  });
}

async function getRequester(req: any) {
  const clerkUserId = (req as any).clerkUserId as string | null;
  if (!clerkUserId) return null;
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

type Requester = Awaited<ReturnType<typeof getRequester>>;

function canSeeMedical(requester: Requester, householdId: number | null): boolean {
  if (!requester) return false;
  if (requester.role === "coach" || requester.role === "admin") return true;
  return householdId !== null && requester.householdId === householdId;
}

router.get("/households", requireApproved, async (req, res) => {
  const requester = await getRequester(req);
  const enrolledOnly = req.query.enrolledOnly === "true";
  const includeArchived = req.query.includeArchived === "true";

  let conditions: any[] = [];
  if (enrolledOnly) conditions.push(eq(householdsTable.seasonEnrolled, true));
  if (!includeArchived) conditions.push(isNull(householdsTable.archivedAt));

  const baseQuery = conditions.length > 0
    ? db.select().from(householdsTable).where(and(...conditions))
    : db.select().from(householdsTable);
  const households = await baseQuery;
  const result = await Promise.all(
    households.map(async (h) => {
      const members = await db.select().from(usersTable).where(eq(usersTable.householdId, h.id));
      const see = canSeeMedical(requester, h.id);
      return { ...h, members: members.map((m) => shapeHouseholdMember(m, see)) };
    })
  );
  res.json(result);
});

router.post("/households", requireAuth, async (req, res) => {
  const parsed = createHouseholdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, podId, address, emergencyContactName, emergencyContactPhone } = parsed.data;
  const [household] = await db.insert(householdsTable).values({
    name,
    inviteCode: generateInviteCode(),
    podId: podId ?? null,
    address: address ?? null,
    emergencyContactName: emergencyContactName ?? null,
    emergencyContactPhone: emergencyContactPhone ?? null,
  }).returning();
  res.status(201).json(household);
});

router.get("/households/by-invite/:code", publicLookupLimiter, async (req, res) => {
  const code = str(req.params.code);
  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.inviteCode, code),
  });
  if (!household) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }
  // Return safe public info only
  res.json({ id: household.id, name: household.name, inviteCode: household.inviteCode });
});

router.get("/households/:id", requireApproved, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return;
  }
  const [requester, members] = await Promise.all([
    getRequester(req),
    db.select().from(usersTable).where(eq(usersTable.householdId, id)),
  ]);
  const see = canSeeMedical(requester, id);
  res.json({ ...household, members: members.map((m) => shapeHouseholdMember(m, see)) });
});

router.patch("/households/:id", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));

  // IDOR guard: requester must belong to this household or be coach/admin
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const parsed = updateHouseholdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }
  const { name, address, emergencyContactName, emergencyContactPhone } = parsed.data;
  const [updated] = await db.update(householdsTable)
    .set({ name, address, emergencyContactName, emergencyContactPhone })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

// Narrow, audited correction workflow. It is intentionally separate from the
// normal household routes so a coach cannot use routine edit permissions to
// alter family structure or a linked authentication identity.
router.patch("/households/:householdId/admin", requireAdmin, async (req, res) => {
  const householdId = Number(str(req.params.householdId));
  const parsed = adminHouseholdPatchSchema.safeParse(req.body);
  if (!Number.isInteger(householdId) || householdId < 1 || !parsed.success || Object.keys(parsed.success ? parsed.data : {}).length === 0) {
    res.status(400).json({ error: "Invalid request body", ...(parsed.success ? {} : { details: parsed.error.issues }) });
    return;
  }
  const administrator = await getRequester(req);
  if (!administrator) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(householdsTable).where(eq(householdsTable.id, householdId));
    if (!before) return null;
    const [after] = await tx.update(householdsTable).set(parsed.data).where(eq(householdsTable.id, householdId)).returning();
    await writeHouseholdAdminAudit(tx, administrator.id, "household.patch", householdId, null, before, after);
    return after;
  });
  if (!result) { res.status(404).json({ error: "Household not found" }); return; }
  res.json(result);
});

router.patch("/households/:householdId/admin/members/:memberId", requireAdmin, async (req, res) => {
  const householdId = Number(str(req.params.householdId));
  const memberId = Number(str(req.params.memberId));
  if (!Number.isInteger(householdId) || householdId < 1 || !Number.isInteger(memberId) || memberId < 1) {
    res.status(400).json({ error: "Invalid member or household id" }); return;
  }
  const administrator = await getRequester(req);
  if (!administrator) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select().from(usersTable).where(and(eq(usersTable.id, memberId), eq(usersTable.householdId, householdId)));
    if (!member) return { status: 404 as const };
    const parsed = (member.role === "student" ? adminStudentMemberPatchSchema : adminAdultMemberPatchSchema).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.success ? parsed.data : {}).length === 0) {
      return { status: 400 as const, details: parsed.success ? undefined : parsed.error.issues };
    }
    const [after] = await tx.update(usersTable).set(parsed.data).where(eq(usersTable.id, memberId)).returning();
    await writeHouseholdAdminAudit(tx, administrator.id, "member.profile.patch", householdId, memberId, member, after);
    return { status: 200 as const, member: after };
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.status === 404 ? "Member not found in household" : "Invalid request body", details: result.details }); return; }
  res.json(safeAdminMember(result.member));
});

router.post("/households/:householdId/admin/members/:memberId/reclassify", requireAdmin, async (req, res) => {
  const householdId = Number(str(req.params.householdId));
  const memberId = Number(str(req.params.memberId));
  const parsed = reclassifySchema.safeParse(req.body);
  if (!Number.isInteger(householdId) || !Number.isInteger(memberId) || householdId < 1 || memberId < 1 || !parsed.success) {
    res.status(400).json({ error: "Invalid request body", ...(parsed.success ? {} : { details: parsed.error.issues }) }); return;
  }
  const administrator = await getRequester(req);
  if (!administrator) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select().from(usersTable).where(and(eq(usersTable.id, memberId), eq(usersTable.householdId, householdId)));
    if (!member) return { status: 404 as const };
    if (!["parent", "student"].includes(member.role) || member.role === parsed.data.role) return { status: 409 as const, error: "Only parent and student members can be reclassified." };
    if (member.role === "parent") {
      const members = await tx.select().from(usersTable).where(eq(usersTable.householdId, householdId));
      const hasStudents = members.some((u: any) => u.role === "student");
      const responsibleAdults = members.filter((u: any) => isResponsibleAdult(u)).length;
      if (hasStudents && responsibleAdults <= 1) return { status: 409 as const, error: "Cannot reclassify the last responsible adult while students remain." };
    }
    const [after] = await tx.update(usersTable).set({ role: parsed.data.role }).where(eq(usersTable.id, memberId)).returning();
    await writeHouseholdAdminAudit(tx, administrator.id, "member.reclassify", householdId, memberId, member, after);
    return { status: 200 as const, member: after };
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.error ?? "Member not found in household" }); return; }
  res.json(safeAdminMember(result.member));
});

router.post("/households/:householdId/admin/members/:memberId/move", requireAdmin, async (req, res) => {
  const householdId = Number(str(req.params.householdId));
  const memberId = Number(str(req.params.memberId));
  const parsed = moveSchema.safeParse(req.body);
  if (!Number.isInteger(householdId) || !Number.isInteger(memberId) || householdId < 1 || memberId < 1 || !parsed.success || parsed.success && parsed.data.targetHouseholdId === householdId) {
    res.status(400).json({ error: "Invalid move request" }); return;
  }
  const administrator = await getRequester(req);
  if (!administrator) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db.transaction(async (tx) => {
    const [source, target, member] = await Promise.all([
      tx.select().from(householdsTable).where(eq(householdsTable.id, householdId)),
      tx.select().from(householdsTable).where(eq(householdsTable.id, parsed.data.targetHouseholdId)),
      tx.select().from(usersTable).where(and(eq(usersTable.id, memberId), eq(usersTable.householdId, householdId))),
    ]).then((rows: any[]) => [rows[0][0], rows[1][0], rows[2][0]]);
    if (!source || !target) return { status: 404 as const, error: "Source or target household not found" };
    if (!member) return { status: 404 as const, error: "Member not found in source household" };
    if (isResponsibleAdult(member)) {
      const members = await tx.select().from(usersTable).where(eq(usersTable.householdId, householdId));
      if (members.some((u: any) => u.role === "student") && members.filter((u: any) => isResponsibleAdult(u)).length <= 1) {
        return { status: 409 as const, error: "Cannot move the last responsible adult while students remain." };
      }
    }
    const [after] = await tx.update(usersTable).set({ householdId: target.id, podId: target.podId ?? null }).where(eq(usersTable.id, memberId)).returning();
    await writeHouseholdAdminAudit(tx, administrator.id, "member.move", householdId, memberId, member, after);
    return { status: 200 as const, member: after };
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.error! }); return; }
  res.json(safeAdminMember(result.member));
});

router.delete("/households/:householdId/admin/members/:memberId/duplicate", requireAdmin, async (req, res) => {
  const householdId = Number(str(req.params.householdId));
  const memberId = Number(str(req.params.memberId));
  const parsed = confirmationSchema.safeParse(req.body);
  if (!Number.isInteger(householdId) || !Number.isInteger(memberId) || householdId < 1 || memberId < 1 || !parsed.success) {
    res.status(400).json({ error: "Invalid deletion request" }); return;
  }
  const administrator = await getRequester(req);
  if (!administrator) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select().from(usersTable).where(and(eq(usersTable.id, memberId), eq(usersTable.householdId, householdId)));
    if (!member) return { status: 404 as const, error: "Member not found in household" };
    if (member.clerkUserId) return { status: 409 as const, error: "Linked app accounts cannot be deleted as duplicates." };
    if (isResponsibleAdult(member)) {
      const members = await tx.select().from(usersTable).where(eq(usersTable.householdId, householdId));
      if (members.some((u: any) => u.role === "student") && members.filter((u: any) => isResponsibleAdult(u)).length <= 1) {
        return { status: 409 as const, error: "Cannot delete the last responsible adult while students remain." };
      }
    }

    // Deletion is deliberately more restrictive than ordinary account cleanup:
    // no correction may erase a row that has participated in any activity.
    const references = await Promise.all([
      tx.select({ id: carpoolClaimsTable.id }).from(carpoolClaimsTable).where(eq(carpoolClaimsTable.riderUserId, memberId)).limit(1),
      tx.select({ id: carpoolOffersTable.id }).from(carpoolOffersTable).where(eq(carpoolOffersTable.driverUserId, memberId)).limit(1),
      tx.select({ id: carpoolRequestsTable.id }).from(carpoolRequestsTable).where(or(eq(carpoolRequestsTable.riderUserId, memberId), eq(carpoolRequestsTable.requestedByUserId, memberId))!).limit(1),
      tx.select({ id: notificationsTable.id }).from(notificationsTable).where(eq(notificationsTable.recipientUserId, memberId)).limit(1),
      tx.select({ id: eventTaskSignupsTable.id }).from(eventTaskSignupsTable).where(eq(eventTaskSignupsTable.userId, memberId)).limit(1),
      tx.select({ id: boardPostsTable.id }).from(boardPostsTable).where(eq(boardPostsTable.authorUserId, memberId)).limit(1),
      tx.select({ id: boardThreadsTable.id }).from(boardThreadsTable).where(eq(boardThreadsTable.authorUserId, memberId)).limit(1),
      tx.select({ id: riderInvitesTable.id }).from(riderInvitesTable).where(eq(riderInvitesTable.riderId, memberId)).limit(1),
      tx.select({ id: broadcastsTable.id }).from(broadcastsTable).where(eq(broadcastsTable.senderUserId, memberId)).limit(1),
      tx.select({ id: eventRsvpsTable.id }).from(eventRsvpsTable).where(eq(eventRsvpsTable.userId, memberId)).limit(1),
      tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.createdByUserId, memberId)).limit(1),
      tx.select({ id: rsvpEmailBatchesTable.id }).from(rsvpEmailBatchesTable).where(eq(rsvpEmailBatchesTable.recipientUserId, memberId)).limit(1),
      tx.select({ id: familyInvitesTable.id }).from(familyInvitesTable).where(eq(familyInvitesTable.invitedByUserId, memberId)).limit(1),
      tx.select({ id: pushDevicesTable.id }).from(pushDevicesTable).where(eq(pushDevicesTable.userId, memberId)).limit(1),
      tx.select({ id: boardReactionsTable.id }).from(boardReactionsTable).where(eq(boardReactionsTable.userId, memberId)).limit(1),
      tx.select({ id: riderInvitesTable.id }).from(riderInvitesTable).where(eq(riderInvitesTable.invitedByUserId, memberId)).limit(1),
      tx.select({ id: inviteLinksTable.id }).from(inviteLinksTable).where(eq(inviteLinksTable.createdByUserId, memberId)).limit(1),
      tx.select({ id: podsTable.id }).from(podsTable).where(eq(podsTable.headCoachId, memberId)).limit(1),
      tx.select({ id: householdAdminAuditTable.id }).from(householdAdminAuditTable).where(eq(householdAdminAuditTable.memberId, memberId)).limit(1),
    ]);
    if (references.some((rows: any[]) => rows.length > 0)) {
      return { status: 409 as const, error: "Members with historical or activity records cannot be deleted as duplicates." };
    }
    await writeHouseholdAdminAudit(tx, administrator.id, "member.duplicate.delete", householdId, memberId, member, { deleted: true });
    await tx.delete(usersTable).where(eq(usersTable.id, memberId));
    return { status: 204 as const };
  });
  if (result.status !== 204) { res.status(result.status).json({ error: result.error! }); return; }
  res.status(204).end();
});

router.post("/households/:id/co-parent-invites", requireAuth, async (req, res): Promise<void> => {
  const params = SendCoParentInviteParams.safeParse(req.params);
  const body = SendCoParentInviteBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const householdId = params.data.id;
  const requester = await getRequester(req);
  const canInviteCoParent = requester
    && requester.householdId === householdId
    && (requester.role === "parent" || requester.role === "coach");
  if (!canInviteCoParent) {
    res.status(403).json({ error: "Only a parent or coach in this household can send a co-parent invitation." });
    return;
  }

  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.id, householdId),
  });
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const appBase = getAppBase();
  if (!appBase) {
    res.status(503).json({ error: "Email invitations are not configured right now. You can still copy and share the link." });
    return;
  }

  const email = body.data.email.trim().toLowerCase();
  const now = new Date();
  const expiresAt = coParentInviteExpiresAt();
  const existing = await db.query.familyInvitesTable.findFirst({
    where: and(
      eq(familyInvitesTable.householdId, householdId),
      eq(familyInvitesTable.email, email),
      isNull(familyInvitesTable.acceptedAt),
      isNull(familyInvitesTable.revokedAt),
      gt(familyInvitesTable.expiresAt, now),
    ),
  });

  let token: string;
  if (existing) {
    token = existing.token;
    await db.update(familyInvitesTable)
      .set({ expiresAt, invitedByUserId: requester.id })
      .where(eq(familyInvitesTable.id, existing.id));
  } else {
    token = randomBytes(24).toString("hex");
    await db.insert(familyInvitesTable).values({
      email,
      token,
      householdId,
      invitedByUserId: requester.id,
      expiresAt,
    });
  }

  const inviterName = `${requester.firstName} ${requester.lastName}`.trim() || "A parent";
  const inviteUrl = buildAppUrl(`/family-invite/${token}`);
  if (!inviteUrl) {
    res.status(503).json({ error: "Email invitations are not configured right now. You can still copy and share the link." });
    return;
  }
  const message = addEmailLinks(
    [
      "Hi there!",
      "",
      `${inviterName} invited you to join the ${household.name} household on TrailTeam.`,
      "You'll be able to see the same events, carpools, messages, and notifications.",
      "",
      `Use this private link to join. It is valid for ${CO_PARENT_INVITE_TTL_DAYS} days:`,
      "",
      inviteUrl,
      "",
      "If you weren't expecting this invitation, you can safely ignore this email.",
      "",
      "— The TrailTeam",
    ].join("\n"),
    [{ label: "Join the household on TrailTeam", href: inviteUrl }],
  );
  const emailResult = await sendEmail({
    to: email,
    subject: `${inviterName} invited you to join the ${household.name} household on TrailTeam`,
    ...message,
  });

  if (emailResult.status === "skipped") {
    res.status(503).json({ error: "Email delivery is unavailable right now. You can still copy and share the link." });
    return;
  }
  if (emailResult.status === "failed") {
    res.status(502).json({ error: "We couldn't send that invitation. Please try again or copy the link instead." });
    return;
  }

  res.status(201).json({ email, expiresAt });
});

/** Verbatim text shown to the user and stored in the audit log */
const CANONICAL_ACCEPTANCE_TEXT =
  'Please read this document carefully. By checking the "I accept terms & submit" button, I acknowledge that I accept the terms of this document.';

// ── Clickwrap consent: record a signed document + mark household field ──────
router.post("/households/:id/compliance/consent", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Only household members may record clickwrap consent — coaches/admins who need to
  // record a paper-form attestation should use PATCH /households/:id/compliance instead.
  if (requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden: electronic consent may only be recorded by a member of this household" }); return;
  }

  const bodySchema = z.object({
    documentType: z.enum(["liability_waiver", "media_release", "code_of_conduct"]),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.issues }); return; }

  const { documentType } = parsed.data;

  // Fetch the canonical team document — version and acceptance text are derived server-side
  const [teamDoc] = await db
    .select()
    .from(teamDocumentsTable)
    .where(eq(teamDocumentsTable.type, documentType));

  if (!teamDoc) {
    res.status(400).json({ error: "This document type is not configured" }); return;
  }
  if (!(teamDoc.objectPath || teamDoc.externalUrl)) {
    res.status(400).json({ error: "This document has no file configured yet. Contact your coach." }); return;
  }
  // Version string embeds the server-controlled revision counter so that
  // in-place content replacements at the same URL/path invalidate prior consents.
  const documentVersion = `${teamDoc.type}@v${teamDoc.versionNumber}`;

  const clerkUserId = (req as any).clerkUserId as string;

  // Resolve the current active season — stored in the audit record to scope
  // each consent to the enrollment cycle in which it was signed.
  const [activeSeason] = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.status, "active"))
    .orderBy(desc(seasonsTable.id))
    .limit(1);
  const seasonId = activeSeason?.id ?? null;

  // Use req.ip — Express resolves this via the configured trust-proxy setting,
  // preventing callers from forging the address via X-Forwarded-For.
  const ipAddress = req.ip ?? null;
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const now = new Date();

  const fieldMap = {
    liability_waiver: { signed: "liabilityWaiverSigned" as const, signedAt: "liabilityWaiverSignedAt" as const },
    media_release:   { signed: "mediaReleaseSigned" as const,   signedAt: "mediaReleaseSignedAt" as const },
    code_of_conduct: { signed: "codeOfConductSigned" as const,  signedAt: "codeOfConductSignedAt" as const },
  };
  const { signed, signedAt } = fieldMap[documentType];

  // Atomically insert the consent record and mark the household boolean
  const consent = await db.transaction(async (tx) => {
    const [c] = await tx.insert(documentConsentsTable).values({
      householdId: id,
      clerkUserId,
      documentType,
      documentVersion,
      acceptanceText: CANONICAL_ACCEPTANCE_TEXT,
      seasonId,
      ipAddress,
      userAgent,
      acceptedAt: now,
    }).returning();
    await tx.update(householdsTable)
      .set({ [signed]: true, [signedAt]: now })
      .where(eq(householdsTable.id, id));
    return c;
  });

  res.status(201).json(consent);
});

// ── Per-doc compliance status driven by current-version, active-season consents ──
router.get("/households/:id/compliance/status", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [activeSeason] = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.status, "active"))
    .orderBy(desc(seasonsTable.id))
    .limit(1);
  const activeSeasonId = activeSeason?.id ?? null;

  const teamDocs = await db.select().from(teamDocumentsTable);
  const consents = await db
    .select()
    .from(documentConsentsTable)
    .where(eq(documentConsentsTable.householdId, id))
    .orderBy(desc(documentConsentsTable.acceptedAt));

  const BASE_URL_ENV = process.env.BASE_URL || "";

  const status = (["liability_waiver", "media_release", "code_of_conduct"] as const).map((type) => {
    const doc = teamDocs.find((d) => d.type === type);
    const viewUrl = doc?.objectPath
      ? `${BASE_URL_ENV}/api/storage${doc.objectPath}`
      : doc?.externalUrl ?? null;
    const currentVersion = doc ? `${type}@v${doc.versionNumber}` : null;

    const matchingConsent = consents.find(
      (c) =>
        c.documentType === type &&
        c.documentVersion === currentVersion &&
        c.seasonId === activeSeasonId,
    );

    return {
      documentType: type as string,
      label: doc?.label ?? type.replace(/_/g, " "),
      viewUrl,
      versionNumber: doc?.versionNumber ?? null,
      isSigned: !!matchingConsent,
      signedAt: matchingConsent?.acceptedAt ?? null,
    };
  });

  res.json(status);
});

// ── Consent history for a household ────────────────────────────────────────
router.get("/households/:id/compliance/consents", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const consents = await db
    .select()
    .from(documentConsentsTable)
    .where(eq(documentConsentsTable.householdId, id))
    .orderBy(desc(documentConsentsTable.acceptedAt));
  res.json(consents);
});

// Coach/admin-only: manually override compliance flags (e.g. paper-form signed off-system).
// Family members must use the clickwrap consent endpoint instead.
router.patch("/households/:id/compliance", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));

  const { liabilityWaiverSigned, mediaReleaseSigned, codeOfConductSigned } = req.body;
  const now = new Date();
  const updates: Record<string, any> = {};
  if (liabilityWaiverSigned !== undefined) {
    updates.liabilityWaiverSigned = liabilityWaiverSigned;
    if (liabilityWaiverSigned) updates.liabilityWaiverSignedAt = now;
  }
  if (mediaReleaseSigned !== undefined) {
    updates.mediaReleaseSigned = mediaReleaseSigned;
    if (mediaReleaseSigned) updates.mediaReleaseSignedAt = now;
  }
  if (codeOfConductSigned !== undefined) {
    updates.codeOfConductSigned = codeOfConductSigned;
    if (codeOfConductSigned) updates.codeOfConductSignedAt = now;
  }
  const [updated] = await db.update(householdsTable).set(updates).where(eq(householdsTable.id, id)).returning();
  res.json(updated);
});

router.post("/households/:id/archive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }
  const [updated] = await db.update(householdsTable)
    .set({ archivedAt: new Date() })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.post("/households/:id/unarchive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }
  const [updated] = await db.update(householdsTable)
    .set({ archivedAt: null })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/households/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }
  if (!household.archivedAt) {
    res.status(400).json({ error: "Only archived households can be permanently deleted. Archive the family first." });
    return;
  }

  // Clerk IDs are captured inside the transaction so the set of IDs to clean up
  // in Clerk exactly matches the set deleted from the DB — no race window.
  let memberClerkIds: string[] = [];
  let memberEmailByClerkId: Record<string, string | null> = {};

  await db.transaction(async (tx) => {
    // Collect member user IDs — needed for tables that reference users but not
    // the household directly (carpool offers/claims/requests, notifications).
    // The DB-level onDelete: cascade on those FKs acts as a safety net; this
    // explicit sweep makes the intent clear and guards against any future
    // migration that changes cascade behaviour.
    const memberRows = await tx
      .select({ id: usersTable.id, clerkUserId: usersTable.clerkUserId, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.householdId, id));
    const memberIds = memberRows.map((r) => r.id);
    memberClerkIds = memberRows
      .map((r) => r.clerkUserId)
      .filter((cid): cid is string => cid !== null && cid !== undefined);
    // Build a map so we can name the email address in any Clerk-deletion warning
    memberEmailByClerkId = Object.fromEntries(
      memberRows
        .filter((r) => r.clerkUserId != null)
        .map((r) => [r.clerkUserId as string, r.email ?? null]),
    );

    if (memberIds.length > 0) {
      // 1a. Carpool claims where a household member is the rider
      await tx.delete(carpoolClaimsTable).where(inArray(carpoolClaimsTable.riderUserId, memberIds));
      // 1b. Carpool requests where a household member is the rider or the requester
      await tx.delete(carpoolRequestsTable).where(
        or(
          inArray(carpoolRequestsTable.riderUserId, memberIds),
          inArray(carpoolRequestsTable.requestedByUserId, memberIds),
        )!,
      );
      // 1c. Carpool offers where a household member is the driver
      //     (the cascade from offer → carpoolClaimsTable handles any residual
      //     claims from non-household riders on those offers)
      await tx.delete(carpoolOffersTable).where(inArray(carpoolOffersTable.driverUserId, memberIds));
      // 1d. In-app notification inbox rows
      await tx.delete(notificationsTable).where(inArray(notificationsTable.recipientUserId, memberIds));
      // 1e. Volunteer task sign-up rows
      //     (the DB-level onDelete: cascade on eventTaskSignupsTable.userId acts as
      //     a safety net; this explicit sweep makes the intent clear and guards against
      //     any future migration that changes cascade behaviour)
      await tx.delete(eventTaskSignupsTable).where(inArray(eventTaskSignupsTable.userId, memberIds));
      // 1f. Board reply posts authored by household members.
      //     The schema uses onDelete: set null on boardPostsTable.authorUserId which
      //     would leave posts with a null author rather than removing them.  Explicit
      //     deletion ensures content created by this household is fully purged.
      await tx.delete(boardPostsTable).where(inArray(boardPostsTable.authorUserId, memberIds));
      // 1g. Board threads started by household members.
      //     onDelete: set null on boardThreadsTable.authorUserId would again leave
      //     ghost threads.  Deleting threads here cascades to any remaining posts
      //     inside them (boardPostsTable.threadId has onDelete: cascade) — covering
      //     replies from other users that were in a thread owned by this household.
      await tx.delete(boardThreadsTable).where(inArray(boardThreadsTable.authorUserId, memberIds));
    }

    // 2. Consent audit records (householdId FK)
    await tx.delete(documentConsentsTable).where(eq(documentConsentsTable.householdId, id));
    // 3. Historical season roster snapshots (householdId FK)
    await tx.delete(seasonRosterSnapshotsTable).where(eq(seasonRosterSnapshotsTable.householdId, id));
    // 4. Member user rows — any residual carpool/notification rows cascade at DB level
    await tx.delete(usersTable).where(eq(usersTable.householdId, id));
    // 5. The household itself
    await tx.delete(householdsTable).where(eq(householdsTable.id, id));
  });

  // Delete Clerk accounts after the DB transaction commits.
  // Individual failures are logged and surfaced in the response body but do
  // not roll back the DB deletion — the household is gone regardless.
  const clerkWarnings: string[] = [];
  if (memberClerkIds.length > 0) {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await Promise.all(
      memberClerkIds.map(async (clerkUserId) => {
        try {
          await clerk.users.deleteUser(clerkUserId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const email = memberEmailByClerkId[clerkUserId] ?? null;
          console.error(`Failed to delete Clerk user ${clerkUserId}${email ? ` (${email})` : ""} after household ${id} deletion:`, err);
          clerkWarnings.push(email ?? clerkUserId);
        }
      }),
    );
  }

  res.status(200).json({ warnings: clerkWarnings });
});

router.get("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== id) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }
  const riders = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.householdId, id), eq(usersTable.role, "student")));
  const see = canSeeMedical(requester, id);
  res.json(riders.map((r) => shapeMedical(r, see)));
});

router.post("/households/:id/riders", requireAuth, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { firstName, lastName, grade, allergies, medications, medicalNotes, dateOfBirth, email, emailNotifications, notificationPreferences } = req.body;

  // IDOR guard: requester must belong to this household or be coach/admin
  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!canSeeMedical(requester, id) && requester.role !== "coach" && requester.role !== "admin") {
    if (requester.householdId !== id) {
      res.status(403).json({ error: "Forbidden: you are not a member of this household" });
      return;
    }
  }

  const household = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, id) });
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }

  // Validate and build canonical student prefs — carpool/roster are always false for students
  let studentPrefs = { practiceReminders: true, coachMessages: true, carpoolUpdates: false, eventReminders: true, rosterUpdates: false, boardReplies: true };
  if (notificationPreferences != null) {
    const parsedPrefs = studentNotifPrefsSchema.safeParse(notificationPreferences);
    if (!parsedPrefs.success) {
      res.status(400).json({ error: "Invalid notificationPreferences", details: parsedPrefs.error.issues });
      return;
    }
    const safePrefs = parsedPrefs.data;
    studentPrefs = {
      practiceReminders: safePrefs.practiceReminders ?? true,
      coachMessages: safePrefs.coachMessages ?? true,
      carpoolUpdates: false,
      eventReminders: safePrefs.eventReminders ?? true,
      rosterUpdates: false,
      boardReplies: true,
    };
  }

  const [rider] = await db.insert(usersTable).values({
    householdId: id,
    firstName,
    lastName,
    role: "student",
    approved: true,
    podId: household.podId ?? null,
    email: (email && email.trim()) ? email.trim() : `rider-${randomBytes(6).toString("hex")}@trailteam.internal`,
    emailNotifications: emailNotifications ?? false,
    smsNotifications: false,
    pushNotifications: false,
    notificationPreferences: studentPrefs,
    grade: grade ?? null,
    allergies: allergies ?? null,
    medications: medications ?? null,
    medicalNotes: medicalNotes ?? null,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
  }).returning();
  res.status(201).json(rider);
});

router.patch("/households/:id/riders/:riderId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));

  // IDOR guard: requester must belong to this household or be coach/admin
  const patchRiderRequester = await getRequester(req);
  if (!patchRiderRequester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (patchRiderRequester.role !== "coach" && patchRiderRequester.role !== "admin" && patchRiderRequester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const { firstName, lastName, grade, allergies, medications, medicalNotes, email, emailNotifications, notificationPreferences, notificationPreferencesLocked } = req.body;

  const updates: Record<string, any> = {
    firstName, lastName,
    grade: grade ?? null,
    allergies: allergies ?? null,
    medications: medications ?? null,
    medicalNotes: medicalNotes ?? null,
  };
  if (email !== undefined) updates.email = email || `rider-${riderId}@trailteam.internal`;
  if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;
  if (notificationPreferencesLocked !== undefined) updates.notificationPreferencesLocked = !!notificationPreferencesLocked;
  // Students cannot receive SMS or push notifications
  updates.smsNotifications = false;
  updates.pushNotifications = false;
  if (notificationPreferences !== undefined) {
    const parsedRiderPrefs = studentNotifPrefsSchema.safeParse(notificationPreferences);
    if (!parsedRiderPrefs.success) {
      res.status(400).json({ error: "Invalid notificationPreferences", details: parsedRiderPrefs.error.issues });
      return;
    }
    const safeRiderPrefs = parsedRiderPrefs.data;
    updates.notificationPreferences = {
      practiceReminders: safeRiderPrefs.practiceReminders ?? true,
      coachMessages: safeRiderPrefs.coachMessages ?? true,
      carpoolUpdates: false,
      eventReminders: safeRiderPrefs.eventReminders ?? true,
      rosterUpdates: false,
      boardReplies: true,
    };
  }

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Rider not found" }); return; }
  res.json(updated);
});

router.delete("/households/:id/members/:userId", requireAuth, async (req, res) => {
  const householdId = parseInt(str(req.params.id));
  const targetUserId = parseInt(str(req.params.userId));

  const requester = await getRequester(req);
  if (!requester) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Must be a member of this household OR coach/admin
  if (requester.role !== "coach" && requester.role !== "admin" && requester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Cannot remove yourself
  if (requester.id === targetUserId) {
    res.status(400).json({ error: "Cannot remove yourself from a household" }); return;
  }

  // Find the target — must be an adult (non-student) in this household
  const target = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.id, targetUserId), eq(usersTable.householdId, householdId)),
  });
  if (!target || target.role === "student") { res.status(404).json({ error: "Member not found" }); return; }

  // Regular parents cannot remove a coach
  if (target.role === "coach" && requester.role !== "coach" && requester.role !== "admin") {
    res.status(403).json({ error: "Only coaches or admins can remove a coach" }); return;
  }

  // Detach from household — keep the user account intact
  await db.update(usersTable)
    .set({ householdId: null })
    .where(and(eq(usersTable.id, targetUserId), eq(usersTable.householdId, householdId)));

  res.status(204).send();
});

router.delete("/households/:id/riders/:riderId", requireAuth, async (req, res): Promise<void> => {
  const householdId = parseInt(str(req.params.id));
  const riderId = parseInt(str(req.params.riderId));

  // IDOR guard: requester must belong to this household or be coach/admin
  const deleteRequester = await getRequester(req);
  if (!deleteRequester) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (deleteRequester.role !== "coach" && deleteRequester.role !== "admin" && deleteRequester.householdId !== householdId) {
    res.status(403).json({ error: "Forbidden: you are not a member of this household" });
    return;
  }

  const rider = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.id, riderId), eq(usersTable.householdId, householdId), eq(usersTable.role, "student")),
  });
  if (!rider) {
    res.status(404).json({ error: "Rider not found in this household" });
    return;
  }

  const result = await permanentlyDeleteLocalAccount(rider);
  if (!result.ok) {
    if (result.stage === "clerk") {
      res.status(502).json({ error: "The sign-in service could not be reached. The rider was not removed; please try again." });
      return;
    }
    res.status(500).json({ error: "The rider sign-in was removed, but TrailTeam could not finish deleting their data. Use the account deletion tool to retry." });
    return;
  }

  res.status(204).send();
});

export default router;
