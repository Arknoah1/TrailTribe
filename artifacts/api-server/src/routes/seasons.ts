import { Router } from "express";
import { db } from "@workspace/db";
import {
  seasonsTable,
  seasonRosterSnapshotsTable,
  householdsTable,
  usersTable,
  podsTable,
} from "@workspace/db";
import { eq, and, or, desc, lt } from "drizzle-orm";
import { requireAuth, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { sendEmail } from "../lib/email";
import { z } from "zod";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

const createSeasonSchema = z.object({
  name: z.string().min(1, "Season name is required"),
  startDate: z.string().optional(),
  autoEnrollExisting: z.boolean().optional().default(false),
});

// ── List all seasons ───────────────────────────────────────────────────────
router.get("/seasons", requireCoachOrAdmin, async (req, res) => {
  const seasons = await db
    .select()
    .from(seasonsTable)
    .orderBy(desc(seasonsTable.startDate));
  res.json(seasons);
});

// ── Get active season (any authenticated user, for frontend routing) ────────
router.get("/seasons/active", requireAuth, async (req, res) => {
  const active = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });
  res.json(active ?? null);
});

// ── Create a new season ────────────────────────────────────────────────────
router.post("/seasons", requireCoachOrAdmin, async (req, res) => {
  const parsed = createSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  // Ensure no other active season exists
  const existing = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });
  if (existing) {
    res.status(409).json({ error: "An active season already exists. Close it before starting a new one." });
    return;
  }

  const { name, startDate, autoEnrollExisting } = parsed.data;

  const [season] = await db
    .insert(seasonsTable)
    .values({
      name,
      status: "active",
      startDate: startDate ? new Date(startDate) : new Date(),
    })
    .returning();

  // Optionally mark all households with at least one approved parent as enrolled
  if (autoEnrollExisting) {
    const approvedParents = await db
      .select({ householdId: usersTable.householdId })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.approved, true),
          or(eq(usersTable.role, "parent"), eq(usersTable.role, "coach"))
        )
      );
    const hids = [...new Set(approvedParents.map((r) => r.householdId).filter(Boolean))] as number[];
    if (hids.length > 0) {
      await Promise.all(
        hids.map((hid) =>
          db.update(householdsTable).set({ seasonEnrolled: true }).where(eq(householdsTable.id, hid))
        )
      );
    }
  }

  res.status(201).json(season);
});

// ── Close the active season ────────────────────────────────────────────────
// Transactionally:
//   1. Snapshot every household (enrolled or not) with their live state
//   2. Mark the season closed
//   3. Reset compliance, enrollment, pod assignments on all households
//   4. Reset approved flag for parents
router.post("/seasons/:id/close", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const season = await db.query.seasonsTable.findFirst({ where: eq(seasonsTable.id, id) });
  if (!season) {
    res.status(404).json({ error: "Season not found" });
    return;
  }
  if (season.status === "closed") {
    res.status(409).json({ error: "Season is already closed" });
    return;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 0. Read current state INSIDE the transaction so the snapshot is consistent
    //    with what is being reset (no concurrent writes can slip through).
    const [allHouseholds, allMembers, allPods] = await Promise.all([
      tx.select().from(householdsTable),
      tx.select().from(usersTable),
      tx.select().from(podsTable),
    ]);

    // 1. Write immutable snapshots for every household
    if (allHouseholds.length > 0) {
      const snapshots = allHouseholds.map((h) => {
        const pod = allPods.find((p) => String(p.id) === h.podId);
        const members = allMembers
          .filter((m) => m.householdId === h.id)
          .map((m) => ({
            firstName: m.firstName ?? "",
            lastName: m.lastName ?? "",
            role: m.role ?? "parent",
            approved: m.approved ?? false,
          }));
        return {
          seasonId: id,
          householdId: h.id,
          familyName: h.name ?? "",
          podName: pod?.name ?? null,
          enrolled: h.seasonEnrolled,
          liabilityWaiverSigned: h.liabilityWaiverSigned ?? false,
          mediaReleaseSigned: h.mediaReleaseSigned ?? false,
          codeOfConductSigned: h.codeOfConductSigned ?? false,
          emergencyContactName: h.emergencyContactName ?? null,
          emergencyContactPhone: h.emergencyContactPhone ?? null,
          members,
        };
      });
      await tx.insert(seasonRosterSnapshotsTable).values(snapshots);
    }

    // 2. Mark the season as closed
    await tx
      .update(seasonsTable)
      .set({ status: "closed", endDate: now })
      .where(eq(seasonsTable.id, id));

    // 3. Reset all households: compliance docs, enrollment, pod assignment
    await tx.update(householdsTable).set({
      liabilityWaiverSigned: false,
      liabilityWaiverSignedAt: null,
      mediaReleaseSigned: false,
      mediaReleaseSignedAt: null,
      codeOfConductSigned: false,
      codeOfConductSignedAt: null,
      seasonEnrolled: false,
      podId: null,
    });

    // 4. Reset approved flag for parents (coaches keep their approval)
    await tx
      .update(usersTable)
      .set({ approved: false })
      .where(or(eq(usersTable.role, "parent")));
  });

  const [closed] = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.id, id));

  res.json(closed);
});

// ── Get season roster ──────────────────────────────────────────────────────
// Closed seasons: read from immutable snapshots (historical truth)
// Active season:  read live households (honour ?enrolledOnly=true)
router.get("/seasons/:id/roster", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const season = await db.query.seasonsTable.findFirst({ where: eq(seasonsTable.id, id) });
  if (!season) {
    res.status(404).json({ error: "Season not found" });
    return;
  }

  if (season.status === "closed") {
    // Return snapshot rows normalized to the same shape as live-household rows
    // so the UI can render them without branching on season status.
    const snapshots = await db
      .select()
      .from(seasonRosterSnapshotsTable)
      .where(eq(seasonRosterSnapshotsTable.seasonId, id))
      .orderBy(seasonRosterSnapshotsTable.familyName);

    const normalized = snapshots.map((s) => ({
      // Live-household fields the UI reads
      id: s.householdId,
      name: s.familyName,
      seasonEnrolled: s.enrolled,
      podId: null, // raw FK not needed; pod object below
      pod: s.podName ? { id: 0, name: s.podName } : null,
      // Compliance flags
      liabilityWaiverSigned: s.liabilityWaiverSigned,
      mediaReleaseSigned: s.mediaReleaseSigned,
      codeOfConductSigned: s.codeOfConductSigned,
      // Contact info
      emergencyContactName: s.emergencyContactName,
      emergencyContactPhone: s.emergencyContactPhone,
      // Members array (snapshot JSONB → UI-compatible shape)
      members: (s.members as Array<{ firstName: string; lastName: string; role: string; approved: boolean }>).map((m) => ({
        firstName: m.firstName,
        lastName: m.lastName,
        role: m.role,
        approved: m.approved,
        // null-safe extras the UI might touch
        householdId: s.householdId,
      })),
      // Mark as archived snapshot so UI can show "Did not return" correctly
      _isSnapshot: true,
    }));

    res.json(normalized);
    return;
  }

  // Active season — live data
  const enrolledOnly = req.query.enrolledOnly === "true";
  const households = enrolledOnly
    ? await db.select().from(householdsTable).where(eq(householdsTable.seasonEnrolled, true))
    : await db.select().from(householdsTable);

  const members = await db.select().from(usersTable);
  const pods = await db.select().from(podsTable);

  const result = households.map((h) => ({
    ...h,
    members: members.filter((m) => m.householdId === h.id),
    pod: pods.find((p) => String(p.id) === h.podId) ?? null,
  }));

  res.json(result);
});

// ── CSV export ─────────────────────────────────────────────────────────────
// Closed seasons: read from immutable snapshots
// Active season:  read live households (all)
router.get("/seasons/:id/export.csv", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(str(req.params.id));
  const season = await db.query.seasonsTable.findFirst({ where: eq(seasonsTable.id, id) });
  if (!season) {
    res.status(404).json({ error: "Season not found" });
    return;
  }

  function csvCell(val: string | null | undefined): string {
    if (val == null) return "";
    const s = String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  const header = [
    "Family Name",
    "Riders",
    "Pod",
    "Enrolled",
    "Waiver",
    "Media Release",
    "Code of Conduct",
    "Emergency Contact",
    "Emergency Phone",
  ].map(csvCell).join(",");

  let rows: string[];

  if (season.status === "closed") {
    // Historical snapshots
    const snapshots = await db
      .select()
      .from(seasonRosterSnapshotsTable)
      .where(eq(seasonRosterSnapshotsTable.seasonId, id))
      .orderBy(seasonRosterSnapshotsTable.familyName);

    rows = snapshots.map((s) => {
      const riders = (s.members as Array<{ firstName: string; lastName: string; role: string }>)
        .filter((m) => m.role === "student")
        .map((m) => `${m.firstName} ${m.lastName}`)
        .join("; ");
      return [
        s.familyName,
        riders,
        s.podName ?? "",
        s.enrolled ? "Y" : "N",
        s.liabilityWaiverSigned ? "Y" : "N",
        s.mediaReleaseSigned ? "Y" : "N",
        s.codeOfConductSigned ? "Y" : "N",
        s.emergencyContactName ?? "",
        s.emergencyContactPhone ?? "",
      ].map(csvCell).join(",");
    });
  } else {
    // Active season — live data
    const households = await db.select().from(householdsTable);
    const members = await db.select().from(usersTable);
    const pods = await db.select().from(podsTable);

    rows = households.map((h) => {
      const riders = members
        .filter((m) => m.householdId === h.id && m.role === "student")
        .map((m) => `${m.firstName} ${m.lastName}`)
        .join("; ");
      const pod = pods.find((p) => String(p.id) === h.podId);
      return [
        h.name,
        riders,
        pod?.name ?? "",
        h.seasonEnrolled ? "Y" : "N",
        h.liabilityWaiverSigned ? "Y" : "N",
        h.mediaReleaseSigned ? "Y" : "N",
        h.codeOfConductSigned ? "Y" : "N",
        h.emergencyContactName ?? "",
        h.emergencyContactPhone ?? "",
      ].map(csvCell).join(",");
    });
  }

  const csv = [header, ...rows].join("\r\n");
  const filename = `${season.name.replace(/[^a-z0-9]/gi, "-")}-roster.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Send re-enrollment reminder to returning families ──────────────────────
// Emails all parent users whose household has not yet enrolled this season
// AND whose household existed before the active season started (i.e. they are
// a returning family, not a brand-new registration).
router.post("/seasons/active/remind-returning", requireCoachOrAdmin, async (req, res) => {
  const active = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });
  if (!active) {
    res.status(404).json({ error: "No active season found." });
    return;
  }

  const seasonStart = active.startDate ?? active.createdAt;

  // Find households that: (1) have not enrolled this season, and
  // (2) were created before the season started (returning families).
  const returningHouseholds = await db
    .select()
    .from(householdsTable)
    .where(
      and(
        eq(householdsTable.seasonEnrolled, false),
        lt(householdsTable.createdAt, seasonStart)
      )
    );

  if (returningHouseholds.length === 0) {
    res.json({ sent: 0, message: "All returning families have already enrolled." });
    return;
  }

  const householdIds = returningHouseholds.map((h) => h.id);

  // Pick one primary contact per household — the parent/coach with the lowest
  // user id (oldest account) who has a real email address.
  const allMembers = await db.select().from(usersTable);

  const primaryContacts: string[] = [];
  for (const household of returningHouseholds) {
    const contact = allMembers
      .filter(
        (u) =>
          u.householdId === household.id &&
          (u.role === "parent" || u.role === "coach") &&
          u.email
      )
      .sort((a, b) => a.id - b.id)[0];
    if (contact?.email) primaryContacts.push(contact.email);
  }

  if (primaryContacts.length === 0) {
    res.json({ emailsSent: 0, householdsTargeted: 0, message: "No email addresses found for returning families." });
    return;
  }

  // One email per household — no shared To header, no duplicate outreach.
  const results = await Promise.all(
    primaryContacts.map((address) =>
      sendEmail({
        to: address,
        subject: `Re-enroll for ${active.name} — TrailTribe`,
        text: [
          `Hi,`,
          ``,
          `A new season (${active.name}) has started on TrailTribe!`,
          ``,
          `Please log in and complete your enrollment to join the roster for this season.`,
          `Your family will need to re-sign compliance documents and confirm your spot`,
          `before a coach can assign you to a pod.`,
          ``,
          `Log in at TrailTribe to get started.`,
          ``,
          `— The TrailTribe Team`,
        ].join("\n"),
      })
    )
  );

  const emailsSent = results.filter((r) => r.status === "sent").length;
  const emailsFailed = results.filter((r) => r.status === "failed").length;

  res.json({
    emailsSent,
    emailsFailed,
    householdsTargeted: returningHouseholds.length,
  });
});

// ── Send re-enrollment reminder to a single returning household ────────────
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

router.post("/seasons/active/remind-returning/:householdId", requireCoachOrAdmin, async (req, res) => {
  const householdId = parseInt(str(req.params.householdId));
  if (isNaN(householdId)) {
    res.status(400).json({ error: "Invalid householdId." });
    return;
  }

  const active = await db.query.seasonsTable.findFirst({
    where: eq(seasonsTable.status, "active"),
  });
  if (!active) {
    res.status(404).json({ error: "No active season found." });
    return;
  }

  const seasonStart = active.startDate ?? active.createdAt;

  // Validate the household is a returning, unenrolled family
  const household = await db.query.householdsTable.findFirst({
    where: eq(householdsTable.id, householdId),
  });

  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }
  if (household.seasonEnrolled) {
    res.status(409).json({ error: "This household has already enrolled for the current season." });
    return;
  }
  if (household.createdAt >= seasonStart) {
    res.status(409).json({ error: "This household is new this season, not a returning family." });
    return;
  }

  // Cooldown check — prevent duplicate reminders within 24 hours
  if (household.lastReminderSentAt) {
    const elapsed = Date.now() - new Date(household.lastReminderSentAt).getTime();
    if (elapsed < REMINDER_COOLDOWN_MS) {
      const remainingMs = REMINDER_COOLDOWN_MS - elapsed;
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      res.status(429).json({
        error: `A reminder was already sent to this family within the last 24 hours. Please wait ${remainingHours} more ${remainingHours === 1 ? "hour" : "hours"} before sending another.`,
        cooldownUntil: new Date(new Date(household.lastReminderSentAt).getTime() + REMINDER_COOLDOWN_MS).toISOString(),
      });
      return;
    }
  }

  // Find the primary contact (oldest parent/coach account with an email)
  const allMembers = await db.select().from(usersTable).where(eq(usersTable.householdId, householdId));
  const contact = allMembers
    .filter((u) => (u.role === "parent" || u.role === "coach") && u.email)
    .sort((a, b) => a.id - b.id)[0];

  if (!contact?.email) {
    res.status(422).json({ error: "No email address found for this household." });
    return;
  }

  const result = await sendEmail({
    to: contact.email,
    subject: `Re-enroll for ${active.name} — TrailTribe`,
    text: [
      `Hi,`,
      ``,
      `A new season (${active.name}) has started on TrailTribe!`,
      ``,
      `Please log in and complete your enrollment to join the roster for this season.`,
      `Your family will need to re-sign compliance documents and confirm your spot`,
      `before a coach can assign you to a pod.`,
      ``,
      `Log in at TrailTribe to get started.`,
      ``,
      `— The TrailTribe Team`,
    ].join("\n"),
  });

  if (result.status === "failed") {
    res.status(500).json({ error: "Failed to send reminder email." });
    return;
  }

  // Record the timestamp so the cooldown window is enforced on subsequent calls
  const now = new Date();
  await db
    .update(householdsTable)
    .set({ lastReminderSentAt: now })
    .where(eq(householdsTable.id, householdId));

  res.json({ sent: 1, email: contact.email, reminderSentAt: now.toISOString() });
});

export default router;
