import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  householdsTable,
  inviteLinksTable,
  seasonsTable,
  teamDocumentsTable,
  documentConsentsTable,
} from "@workspace/db";
import { eq, and, ilike, or, isNull, desc } from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { notifyCoachesOfNewFamily, notifyCoachesOfReturningFamily } from "../lib/notifications";
import { randomBytes } from "crypto";
import { randomUUID } from "crypto";
import { createClerkClient } from "@clerk/express";
import { z } from "zod";

const notificationPreferencesSchema = z.object({
  practiceReminders: z.boolean(),
  coachMessages: z.boolean(),
  carpoolUpdates: z.boolean(),
  eventReminders: z.boolean(),
  rosterUpdates: z.boolean(),
  boardReplies: z.boolean().optional().default(true),
});

const userRoleSchema = z.enum(["parent", "coach", "admin", "student"]);

// Schema for PATCH /users/:id (coach/admin editing a family member)
const patchUserByIdSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: userRoleSchema.optional(),
  podId: z.string().max(100).nullable().optional(),
  householdId: z.number().int().positive().nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

// Schema for POST /pending-approvals/:id/approve
const approveUserSchema = z.object({
  podId: z.string().max(100).nullable().optional(),
  householdId: z.number().int().positive().nullable().optional(),
  role: userRoleSchema.optional(),
}).strict();

// Schema for PUT /users/me (full self-update)
const putUsersMeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).nullable().optional(),
  grade: z.number().int().nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  notificationPreferences: notificationPreferencesSchema.optional(),
}).strict();

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

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

async function getRequester(req: any) {
  const clerkUserId = (req as any).clerkUserId as string | null;
  if (!clerkUserId) return null;
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

type Requester = Awaited<ReturnType<typeof getRequester>>;

function isCoachOrAdmin(requester: Requester): boolean {
  return requester?.role === "coach" || requester?.role === "admin";
}

const DEFAULT_NOTIFICATION_PREFS = {
  practiceReminders: true,
  coachMessages: true,
  carpoolUpdates: true,
  eventReminders: true,
  rosterUpdates: true,
  boardReplies: true,
};

/** A household is "returning" if it predates the active season and hasn't re-enrolled yet. */
async function getIsReturningFamily(householdId: number | null): Promise<boolean> {
  if (!householdId) return false;
  const [activeSeason, household] = await Promise.all([
    db.query.seasonsTable.findFirst({ where: eq(seasonsTable.status, "active") }),
    db.query.householdsTable.findFirst({ where: eq(householdsTable.id, householdId) }),
  ]);
  if (!activeSeason || !household) return false;
  return (
    new Date(household.createdAt) < new Date(activeSeason.startDate) &&
    !household.seasonEnrolled
  );
}

async function getOrCreateUser(clerkUserId: string): Promise<typeof usersTable.$inferSelect | null> {
  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (user) return user;

  try {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@trailtribe.app`;
    const firstName = clerkUser.firstName ?? "New";
    const lastName = clerkUser.lastName ?? "User";

    const existing = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });
    if (existing) {
      [user] = await db.update(usersTable)
        .set({ clerkUserId })
        .where(eq(usersTable.id, existing.id))
        .returning();
    } else {
      [user] = await db.insert(usersTable).values({
        clerkUserId,
        firstName,
        lastName,
        email,
        role: "parent",
        notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
      }).returning();
      // Notify coaches/admins that a new family is waiting for approval (fire-and-forget)
      if (user) {
        notifyCoachesOfNewFamily({ firstName, lastName, email }).catch(() => {});
      }
    }
    return user ?? null;
  } catch {
    return null;
  }
}

router.get("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  let user = await getOrCreateUser(clerkUserId);
  if (!user) {
    res.status(404).json({ error: "User not found and could not be auto-created" });
    return;
  }
  // Backfill notification prefs for existing accounts that predate the column
  if (!user.notificationPreferences && user.role !== "student") {
    const [updated] = await db.update(usersTable)
      .set({ notificationPreferences: DEFAULT_NOTIFICATION_PREFS })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated ?? user;
  }
  const isReturningFamily = user.role === "parent" && !user.approved
    ? await getIsReturningFamily(user.householdId ?? null)
    : false;

  res.setHeader("Cache-Control", "no-store");
  res.json({ ...user, isReturningFamily });
});

router.post("/users/me/household", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.householdId) { res.status(409).json({ error: "User already has a household" }); return; }

  const { name, emergencyContactName, emergencyContactPhone } = req.body;
  if (!name) { res.status(400).json({ error: "Family name is required" }); return; }

  const inviteCode = randomBytes(6).toString("hex");
  const [household] = await db.insert(householdsTable).values({
    name,
    inviteCode,
    emergencyContactName: emergencyContactName ?? null,
    emergencyContactPhone: emergencyContactPhone ?? null,
  }).returning();

  const [updated] = await db.update(usersTable)
    .set({ householdId: household.id })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.status(201).json({ household, user: updated });
});

router.post("/users/me/join", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.householdId) { res.status(409).json({ error: "Already in a household" }); return; }

  const { inviteCode } = req.body;
  if (!inviteCode) { res.status(400).json({ error: "Invite code is required" }); return; }

  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.inviteCode, inviteCode),
  });
  if (!household) { res.status(404).json({ error: "Invalid invite code" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ householdId: household.id, podId: household.podId ?? null, approved: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({ household, user: updated });
});

router.patch("/users/:id/pod", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const { podId } = req.body;
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ podId: podId ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

router.patch("/users/:id/role", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  // Prevent a coach/admin from demoting or promoting themselves
  const requestingUser = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, (req as any).clerkUserId) });
  if (requestingUser?.id === id) {
    res.status(403).json({ error: "You cannot change your own role" });
    return;
  }
  const { role } = req.body;
  if (!["parent", "coach"].includes(role)) {
    res.status(400).json({ error: "Role must be 'parent' or 'coach'" });
    return;
  }
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

router.put("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const parsed = putUsersMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { notificationPreferences, ...rest } = parsed.data;

  const [updated] = await db.update(usersTable)
    .set({ ...rest, notificationPreferences })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(updated);
});

// PATCH /api/users/me — partial update (used by notification toggles auto-save)
router.patch("/users/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const {
    firstName, lastName, phone, avatarUrl, gender, grade,
    notificationsEnabled, emailNotifications, smsNotifications, pushNotifications,
    notificationPreferences, defaultCarpoolSeats, defaultCarpoolTrays,
  } = req.body;

  const patch: Record<string, any> = {};
  if (firstName !== undefined) patch.firstName = firstName;
  if (lastName !== undefined) patch.lastName = lastName;
  if (phone !== undefined) patch.phone = phone;
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;
  if (gender !== undefined) patch.gender = gender;
  if (grade !== undefined) patch.grade = grade;
  if (notificationsEnabled !== undefined) patch.notificationsEnabled = notificationsEnabled;
  if (emailNotifications !== undefined) patch.emailNotifications = emailNotifications;
  if (smsNotifications !== undefined) patch.smsNotifications = smsNotifications;
  if (pushNotifications !== undefined) patch.pushNotifications = pushNotifications;
  if (defaultCarpoolSeats !== undefined) {
    if (defaultCarpoolSeats === null) {
      patch.defaultCarpoolSeats = null;
    } else {
      const seats = Number(defaultCarpoolSeats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        res.status(400).json({ error: "defaultCarpoolSeats must be an integer between 1 and 8, or null" });
        return;
      }
      patch.defaultCarpoolSeats = seats;
    }
  }
  if (defaultCarpoolTrays !== undefined) {
    if (defaultCarpoolTrays === null) {
      patch.defaultCarpoolTrays = null;
    } else {
      const trays = Number(defaultCarpoolTrays);
      if (!Number.isInteger(trays) || trays < 0 || trays > 6) {
        res.status(400).json({ error: "defaultCarpoolTrays must be an integer between 0 and 6, or null" });
        return;
      }
      patch.defaultCarpoolTrays = trays;
    }
  }
  if (notificationPreferences !== undefined) {
    const parsed = notificationPreferencesSchema.safeParse(notificationPreferences);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid notificationPreferences shape", details: parsed.error.issues });
      return;
    }
    patch.notificationPreferences = parsed.data;
  }

  if (Object.keys(patch).length === 0) { res.json(user); return; }

  const [updated] = await db.update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(updated);
});

// ── Re-enroll a returning family for the new season ────────────────────────
// All three compliance booleans must be true.  Updates household + approves user.
router.post("/users/me/reenroll", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.role !== "parent") { res.status(403).json({ error: "Only parents can re-enroll" }); return; }
  if (!user.householdId) { res.status(400).json({ error: "No household associated with this account" }); return; }

  const returning = await getIsReturningFamily(user.householdId);
  if (!returning) {
    res.status(409).json({ error: "This account is not in a returning-family state" });
    return;
  }

  // Validate consent records against the *current* document version AND the
  // active enrollment season — old-version or prior-season consents are rejected.
  const [activeSeason] = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.status, "active"))
    .orderBy(desc(seasonsTable.id))
    .limit(1);
  const activeSeasonId = activeSeason?.id ?? null;

  // All three required document types must be configured with a file URL before
  // any family can re-enroll — prevents bypassing the clickwrap requirement when
  // a coach has never uploaded (or has soft-deleted) one of the required forms.
  const REQUIRED_DOC_TYPES = ["liability_waiver", "media_release", "code_of_conduct"] as const;
  const allTeamDocs = await db.select().from(teamDocumentsTable);
  const unconfigured = REQUIRED_DOC_TYPES.filter((type) => {
    const doc = allTeamDocs.find((d) => d.type === type);
    return !doc || !(doc.objectPath || doc.externalUrl);
  });
  if (unconfigured.length > 0) {
    res.status(400).json({
      error: "Your coach hasn't finished uploading all required documents yet. Contact them before re-enrolling.",
    });
    return;
  }

  const activeDocs = allTeamDocs.filter((d) => d.objectPath || d.externalUrl);
  if (activeDocs.length > 0) {
    const consentRows = await db
      .select({
        documentType: documentConsentsTable.documentType,
        documentVersion: documentConsentsTable.documentVersion,
        seasonId: documentConsentsTable.seasonId,
      })
      .from(documentConsentsTable)
      .where(eq(documentConsentsTable.householdId, user.householdId));

    const unsigned = activeDocs.filter((d) => {
      // The canonical version string uses the server-controlled revision counter
      // so in-place content replacements at the same URL invalidate prior consents.
      const currentVersion = `${d.type}@v${d.versionNumber}`;
      // A valid consent must match: (1) document type, (2) current version (including revision),
      // and (3) the currently active season (null == null when no season is configured)
      return !consentRows.some(
        (c) =>
          c.documentType === d.type &&
          c.documentVersion === currentVersion &&
          c.seasonId === activeSeasonId,
      );
    });
    if (unsigned.length > 0) {
      const labels = unsigned.map((d) => d.label).join(", ");
      res.status(400).json({ error: `These documents must be signed before re-enrolling: ${labels}` });
      return;
    }
  }

  const now = new Date();

  const [updatedHousehold] = await db
    .update(householdsTable)
    .set({
      liabilityWaiverSigned: true,
      liabilityWaiverSignedAt: now,
      mediaReleaseSigned: true,
      mediaReleaseSignedAt: now,
      codeOfConductSigned: true,
      codeOfConductSignedAt: now,
      seasonEnrolled: true,
    })
    .where(eq(householdsTable.id, user.householdId))
    .returning();

  const [updatedUser] = await db
    .update(usersTable)
    .set({ approved: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  // Notify coaches (fire-and-forget)
  notifyCoachesOfReturningFamily({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email ?? "",
  }).catch(() => {});

  res.json({ user: updatedUser, household: updatedHousehold });
});

router.post("/users/me/regenerate-calendar-token", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.approved) { res.status(403).json({ error: "Account not yet approved" }); return; }

  const token = randomUUID();
  await db.update(usersTable).set({ calendarToken: token }).where(eq(usersTable.id, user.id));

  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const httpsUrl = `${protocol}://${host}/api/calendar/${token}/team.ics`;
  const subscribeUrl = `webcal://${host}/api/calendar/${token}/team.ics`;

  res.json({ subscribeUrl, httpsUrl });
});

router.post("/users/onboard", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const { firstName, lastName, phone, role, inviteCode } = req.body;

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (existing) {
    res.status(201).json(existing);
    return;
  }

  let householdId: number | null = null;
  let podId: string | null = null;

  if (inviteCode) {
    const invite = await db.query.inviteLinksTable.findFirst({
      where: and(eq(inviteLinksTable.code, inviteCode), eq(inviteLinksTable.isActive, true)),
    });
    if (invite) {
      householdId = invite.householdId ?? null;
      podId = invite.podId ?? null;
      await db.update(inviteLinksTable)
        .set({ usageCount: (invite.usageCount ?? 0) + 1 })
        .where(eq(inviteLinksTable.id, invite.id));
    }
  }

  const [user] = await db.insert(usersTable).values({
    clerkUserId,
    firstName,
    lastName,
    phone: phone ?? null,
    role: role ?? "parent",
    householdId,
    podId,
    email: `${clerkUserId}@pending.trailtribe.app`,
  }).returning();

  // Notify coaches/admins that a new family is waiting for approval (fire-and-forget)
  // Only for parents/coaches (not for students added by parents)
  const newUserRole = role ?? "parent";
  if (user && (newUserRole === "parent" || newUserRole === "coach")) {
    const displayEmail = user.email;
    notifyCoachesOfNewFamily({ firstName, lastName, email: displayEmail }).catch(() => {});
  }

  res.status(201).json(user);
});

router.get("/users", requireApproved, async (req, res) => {
  const { role, podId, search } = req.query as Record<string, string>;
  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role as any));
  if (podId) conditions.push(eq(usersTable.podId, podId));
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
      )!
    );
  }
  const [requester, users] = await Promise.all([
    getRequester(req),
    conditions.length > 0
      ? db.select().from(usersTable).where(and(...conditions))
      : db.select().from(usersTable),
  ]);
  const see = isCoachOrAdmin(requester);
  res.json(users.map((u) => shapeMedical(u, see)));
});

router.get("/users/:id", requireApproved, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const [requester, user] = await Promise.all([
    getRequester(req),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, id) }),
  ]);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Coaches/admins see all; household members see their own riders' medical data
  const see = isCoachOrAdmin(requester) ||
    (!!requester?.householdId && requester.householdId === user.householdId);
  res.json(shapeMedical(user, see));
});

router.patch("/users/:id", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));

  const parsed = patchUserByIdSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  if (Object.keys(parsed.data).length === 0) {
    const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
    if (!target) { res.status(404).json({ error: "User not found" }); return; }
    res.json(target);
    return;
  }

  const [updated] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
});

router.get("/pending-approvals", requireCoachOrAdmin, async (req, res) => {
  // Students are never in the approval flow — they're added directly by parents
  const pending = await db.select().from(usersTable)
    .where(and(eq(usersTable.approved, false), or(eq(usersTable.role, "parent"), eq(usersTable.role, "coach"))));

  // Enrich each pending user with isReturningFamily + householdName
  const activeSeason = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });

  const enriched = await Promise.all(pending.map(async (u) => {
    let isReturningFamily = false;
    let householdName: string | null = null;
    if (u.householdId) {
      const h = await db.query.householdsTable.findFirst({
        where: eq(householdsTable.id, u.householdId),
      });
      if (h) {
        householdName = h.name ?? null;
        if (activeSeason && new Date(h.createdAt) < new Date(activeSeason.startDate) && !h.seasonEnrolled) {
          isReturningFamily = true;
        }
      }
    }
    return { ...u, isReturningFamily, householdName };
  }));

  res.json(enriched);
});

router.post("/pending-approvals/bulk-approve-returning", requireCoachOrAdmin, async (req, res) => {
  const activeSeason = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });
  if (!activeSeason) {
    res.status(409).json({ error: "No active season — start a season before bulk-approving returning families" });
    return;
  }

  const pending = await db.select().from(usersTable)
    .where(and(eq(usersTable.approved, false), or(eq(usersTable.role, "parent"), eq(usersTable.role, "coach"))));

  const returningIds: number[] = [];
  for (const u of pending) {
    if (!u.householdId) continue;
    const h = await db.query.householdsTable.findFirst({ where: eq(householdsTable.id, u.householdId) });
    if (h && new Date(h.createdAt) < new Date(activeSeason.startDate) && !h.seasonEnrolled) {
      returningIds.push(u.id);
    }
  }

  if (returningIds.length === 0) {
    res.json({ approved: 0 });
    return;
  }

  const now = new Date();

  // Approve users and fully enroll their households (compliance coach-vouched)
  await Promise.all(
    returningIds.map((id) => db.update(usersTable).set({ approved: true }).where(eq(usersTable.id, id)))
  );

  // Collect unique household IDs for the approved users
  const approvedUsers = pending.filter((u) => returningIds.includes(u.id));
  const householdIds = [...new Set(approvedUsers.map((u) => u.householdId).filter(Boolean))] as number[];

  await Promise.all(
    householdIds.map((hid) =>
      db.update(householdsTable).set({
        seasonEnrolled: true,
        liabilityWaiverSigned: true,
        liabilityWaiverSignedAt: now,
        mediaReleaseSigned: true,
        mediaReleaseSignedAt: now,
        codeOfConductSigned: true,
        codeOfConductSignedAt: now,
      }).where(eq(householdsTable.id, hid))
    )
  );

  res.json({ approved: returningIds.length });
});

router.post("/pending-approvals/:id/approve", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));

  const parsed = approveUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { podId, householdId, role } = parsed.data;

  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const updates: Record<string, any> = {
    approved: true,
    role: role ?? existing.role,
    householdId: householdId !== undefined ? householdId : existing.householdId,
  };
  // Pod assignment only applies to coaches, not parents
  if (podId && existing.role !== "parent") updates.podId = podId;

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
