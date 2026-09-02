import {
  and,
  asc,
  eq,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  eventRsvpsTable,
  eventsTable,
  rsvpEmailBatchesTable,
  trailheadsTable,
  usersTable,
} from "@workspace/db";
import { sendEmail } from "./email";
import { logger } from "./logger";
import { getShortNamePrefix } from "../routes/settings";
import { buildRsvpConfirmationContent } from "./rsvpEmailContent";

export const RSVP_EMAIL_BATCH_DELAY_MS = 30_000;
const RSVP_EMAIL_BATCH_POLL_MS = 5_000;
const RSVP_EMAIL_BATCH_LOCK_TIMEOUT_MS = 5 * 60_000;
const RSVP_EMAIL_BATCH_RETRY_MS = 30_000;
const RSVP_EMAIL_BATCH_MAX_ATTEMPTS = 5;
const RSVP_EMAIL_BATCH_WORK_LIMIT = 20;

let batchInterval: ReturnType<typeof setInterval> | null = null;

export async function queueRsvpConfirmationBatch(
  eventId: number,
  recipientUserId: number,
  now = new Date(),
): Promise<void> {
  const dueAt = new Date(now.getTime() + RSVP_EMAIL_BATCH_DELAY_MS);
  await db
    .insert(rsvpEmailBatchesTable)
    .values({
      eventId,
      recipientUserId,
      dueAt,
      status: "pending",
      attempts: 0,
      lockedAt: null,
      sentAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [rsvpEmailBatchesTable.eventId, rsvpEmailBatchesTable.recipientUserId],
      set: {
        dueAt,
        status: "pending",
        attempts: 0,
        lockedAt: null,
        sentAt: null,
        lastError: null,
        updatedAt: now,
      },
    });
}

async function claimDueBatch(): Promise<typeof rsvpEmailBatchesTable.$inferSelect | null> {
  const now = new Date();
  const expiredLockAt = new Date(now.getTime() - RSVP_EMAIL_BATCH_LOCK_TIMEOUT_MS);

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(rsvpEmailBatchesTable)
      .where(
        or(
          and(
            eq(rsvpEmailBatchesTable.status, "pending"),
            lte(rsvpEmailBatchesTable.dueAt, now),
          ),
          and(
            eq(rsvpEmailBatchesTable.status, "processing"),
            lte(rsvpEmailBatchesTable.lockedAt, expiredLockAt),
          ),
        ),
      )
      .orderBy(asc(rsvpEmailBatchesTable.dueAt))
      .limit(1)
      .for("update");

    if (!candidate) return null;

    const [claimed] = await tx
      .update(rsvpEmailBatchesTable)
      .set({
        status: "processing",
        lockedAt: now,
        attempts: sql`${rsvpEmailBatchesTable.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(rsvpEmailBatchesTable.id, candidate.id))
      .returning();

    return claimed ?? null;
  });
}

async function finishBatch(
  batchId: number,
  status: "sent" | "skipped",
  now = new Date(),
): Promise<void> {
  await db
    .update(rsvpEmailBatchesTable)
    .set({
      status,
      lockedAt: null,
      sentAt: status === "sent" ? now : null,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(rsvpEmailBatchesTable.id, batchId));
}

async function failBatch(batch: typeof rsvpEmailBatchesTable.$inferSelect, error: unknown): Promise<void> {
  const now = new Date();
  const message = error instanceof Error ? error.message : String(error);
  const shouldRetry = batch.attempts < RSVP_EMAIL_BATCH_MAX_ATTEMPTS;

  await db
    .update(rsvpEmailBatchesTable)
    .set({
      status: shouldRetry ? "pending" : "failed",
      dueAt: shouldRetry
        ? new Date(now.getTime() + RSVP_EMAIL_BATCH_RETRY_MS * Math.min(8, 2 ** Math.max(0, batch.attempts - 1)))
        : batch.dueAt,
      lockedAt: null,
      lastError: message.slice(0, 1000),
      updatedAt: now,
    })
    .where(eq(rsvpEmailBatchesTable.id, batch.id));

  logger.error(
    { err: error, batchId: batch.id, eventId: batch.eventId, recipientUserId: batch.recipientUserId, retrying: shouldRetry },
    "[rsvp-email-batches] failed to send RSVP confirmation",
  );
}

async function processBatch(batch: typeof rsvpEmailBatchesTable.$inferSelect): Promise<void> {
  try {
    const recipient = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, batch.recipientUserId),
    });
    if (!recipient || !recipient.emailNotifications || !recipient.email) {
      await finishBatch(batch.id, "skipped");
      return;
    }

    const event = await db.query.eventsTable.findFirst({
      where: eq(eventsTable.id, batch.eventId),
    });
    if (!event) {
      await finishBatch(batch.id, "skipped");
      return;
    }

    const householdUserIds = recipient.householdId
      ? (
          await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.householdId, recipient.householdId))
        ).map((user) => user.id)
      : [recipient.id];

    const attendingRsvps = householdUserIds.length > 0
      ? await db
          .select()
          .from(eventRsvpsTable)
          .where(
            and(
              eq(eventRsvpsTable.eventId, batch.eventId),
              eq(eventRsvpsTable.status, "attending"),
              inArray(eventRsvpsTable.userId, householdUserIds),
            ),
          )
      : [];
    if (attendingRsvps.length === 0) {
      await finishBatch(batch.id, "skipped");
      return;
    }

    const attendingUsers = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, attendingRsvps.map((rsvp) => rsvp.userId)));

    const trailhead = event.trailheadId
      ? await db.query.trailheadsTable.findFirst({ where: eq(trailheadsTable.id, event.trailheadId) })
      : null;
    const location = event.locationOverride ?? trailhead?.name ?? "Location TBD";
    const orgPrefix = await getShortNamePrefix();
    const content = buildRsvpConfirmationContent(
      recipient.firstName,
      {
        title: event.title,
        startTime: event.startTime,
        location,
      },
      attendingUsers
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
        .map(({ firstName, lastName }) => ({ firstName, lastName })),
      `/events/${batch.eventId}`,
    );

    const result = await sendEmail({
      to: recipient.email,
      subject: `${orgPrefix}${content.subject}`,
      text: content.text,
      ...(content.html ? { html: content.html } : {}),
    });
    if (result.status === "sent") {
      await finishBatch(batch.id, "sent");
    } else if (result.status === "skipped") {
      await finishBatch(batch.id, "skipped");
    } else {
      await failBatch(batch, result.error);
    }
  } catch (error) {
    await failBatch(batch, error);
  }
}

export async function processDueRsvpEmailBatches(): Promise<void> {
  for (let i = 0; i < RSVP_EMAIL_BATCH_WORK_LIMIT; i += 1) {
    const batch = await claimDueBatch();
    if (!batch) return;
    await processBatch(batch);
  }
}

export function startRsvpEmailBatchJob(): void {
  if (batchInterval) return;
  logger.info("[rsvp-email-batches] starting 30-second RSVP confirmation batch job");
  processDueRsvpEmailBatches().catch((err) => {
    logger.error({ err }, "[rsvp-email-batches] startup processing failed");
  });
  batchInterval = setInterval(() => {
    processDueRsvpEmailBatches().catch((err) => {
      logger.error({ err }, "[rsvp-email-batches] processing failed");
    });
  }, RSVP_EMAIL_BATCH_POLL_MS);
  batchInterval.unref();
}

export function stopRsvpEmailBatchJob(): void {
  if (!batchInterval) return;
  clearInterval(batchInterval);
  batchInterval = null;
  logger.info("[rsvp-email-batches] batch job stopped");
}