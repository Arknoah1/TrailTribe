import { db } from "@workspace/db";
import {
  eventsTable,
  isEventAudienceMember,
  notificationsTable,
  trailheadsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { addEmailLinks, createEmailLink } from "./emailLinks";
import { isDeliverableEmailAddress, sendEmail } from "./email";
import { formatEventDateTime } from "./eventTime";
import { logger } from "./logger";
import { getShortNamePrefix } from "../routes/settings";

type EventRecord = typeof eventsTable.$inferSelect;
type Recipient = typeof usersTable.$inferSelect;

export type EventChange = {
  label: string;
  before: string;
  after: string;
};

type DeliveryMessage = {
  title: string;
  body: string;
  link: string;
};

function sameDate(a: Date | null, b: Date | null): boolean {
  return a?.getTime() === b?.getTime();
}

function sameStrings(a: string[] | null, b: string[] | null): boolean {
  return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
}

function text(value: string | null): string {
  return value?.trim() || "Not set";
}

export function getMaterialEventChanges(
  before: EventRecord,
  after: EventRecord,
  locations: { beforeTrailhead?: string | null; afterTrailhead?: string | null } = {},
): EventChange[] {
  const changes: EventChange[] = [];
  if (before.title.trim() !== after.title.trim()) {
    changes.push({ label: "Title", before: before.title, after: after.title });
  }
  if (!sameDate(before.startTime, after.startTime)) {
    changes.push({
      label: "Starts",
      before: formatEventDateTime(before.startTime),
      after: formatEventDateTime(after.startTime),
    });
  }
  if (!sameDate(before.endTime, after.endTime)) {
    changes.push({
      label: "Ends",
      before: before.endTime ? formatEventDateTime(before.endTime) : "Not set",
      after: after.endTime ? formatEventDateTime(after.endTime) : "Not set",
    });
  }
  if (before.trailheadId !== after.trailheadId) {
    changes.push({
      label: "Trailhead",
      before: locations.beforeTrailhead ?? (before.trailheadId ? "Previous trailhead" : "Not set"),
      after: locations.afterTrailhead ?? (after.trailheadId ? "New trailhead" : "Not set"),
    });
  }
  if (text(before.locationOverride) !== text(after.locationOverride)) {
    changes.push({
      label: "Location",
      before: text(before.locationOverride),
      after: text(after.locationOverride),
    });
  }
  if (text(before.googleMapsUrlOverride) !== text(after.googleMapsUrlOverride)) {
    changes.push({
      label: "Map destination",
      before: text(before.googleMapsUrlOverride),
      after: text(after.googleMapsUrlOverride),
    });
  }
  if (before.isAllTeam !== after.isAllTeam || !sameStrings(before.podIds, after.podIds)) {
    changes.push({
      label: "Audience",
      before: before.isAllTeam ? "All team" : "Selected group",
      after: after.isAllTeam ? "All team" : "Selected group",
    });
  }
  return changes;
}

export function getEventChangeDeliveryChannels(user: Recipient): { inApp: boolean; email: boolean } {
  const eligible = user.isActive
    && user.approved
    && !(user.role === "student" && user.seasonParticipationStatus !== "active")
    && user.notificationsEnabled
    && user.notificationPreferences?.eventReminders !== false;
  return {
    inApp: eligible && user.pushNotifications,
    email: eligible && user.emailNotifications && isDeliverableEmailAddress(user.email),
  };
}

function formatChanges(changes: EventChange[]): string {
  return changes.map((change) => `${change.label}: ${change.before} → ${change.after}`).join("\n");
}

async function deliver(
  user: Recipient,
  title: string,
  body: string,
  link: string,
  emailSubject: string,
): Promise<void> {
  const channels = getEventChangeDeliveryChannels(user);
  if (channels.inApp) {
    try {
      await db.insert(notificationsTable).values({
        recipientUserId: user.id,
        type: "event_changed",
        title,
        body,
        link,
        isRead: false,
      });
    } catch (err) {
      logger.error({ err, userId: user.id }, "[event-changes] in-app delivery failed");
    }
  }
  if (channels.email) {
    try {
      const message = addEmailLinks(
        [`Hi ${user.firstName},`, "", body, "", "— TrailTeam"].join("\n"),
        [createEmailLink(link, "View in TrailTeam")],
      );
      await sendEmail({ to: user.email, subject: emailSubject, ...message });
    } catch (err) {
      logger.error({ err, userId: user.id }, "[event-changes] email delivery failed");
    }
  }
}

async function trailheadName(id: number | null): Promise<string | null> {
  if (!id) return null;
  const row = await db.query.trailheadsTable.findFirst({ where: eq(trailheadsTable.id, id) });
  return row?.name ?? null;
}

export async function notifyEventChanged(before: EventRecord, after: EventRecord): Promise<void> {
  if (after.isArchived || after.startTime.getTime() <= Date.now()) return;
  const [beforeTrailhead, afterTrailhead] = await Promise.all([
    trailheadName(before.trailheadId),
    trailheadName(after.trailheadId),
  ]);
  const changes = getMaterialEventChanges(before, after, { beforeTrailhead, afterTrailhead });
  if (changes.length === 0) return;

  const users = await db.select().from(usersTable);
  const recipients = users.filter((user) =>
    Object.values(getEventChangeDeliveryChannels(user)).some(Boolean)
    && (isEventAudienceMember(before, user) || isEventAudienceMember(after, user)));
  const orgPrefix = await getShortNamePrefix();

  await Promise.allSettled(recipients.map(async (user) => {
    const wasIncluded = isEventAudienceMember(before, user);
    const isIncluded = isEventAudienceMember(after, user);
    const { title, body, link } = buildEventChangeMessage(before, after, changes, wasIncluded, isIncluded);
    try {
      await deliver(user, title, body, link, `${orgPrefix}${title}`);
    } catch (err) {
      logger.error({ err, eventId: after.id, userId: user.id }, "[event-changes] delivery failed");
    }
  }));
}

export function buildEventChangeMessage(
  before: EventRecord,
  after: EventRecord,
  changes: EventChange[],
  wasIncluded: boolean,
  isIncluded: boolean,
): DeliveryMessage {
  if (wasIncluded && !isIncluded) {
    return {
      title: "Event assignment changed",
      body: `${before.title} is no longer assigned to your group.`,
      link: "/calendar",
    };
  }
  if (!wasIncluded && isIncluded) {
    return {
      title: `Event added: ${after.title}`,
      body: `${after.title} is now assigned to your group.\nStarts: ${formatEventDateTime(after.startTime)}`,
      link: `/events/${after.id}`,
    };
  }
  return {
    title: `Event updated: ${after.title}`,
    body: `${after.title} was updated.\n${formatChanges(changes)}`,
    link: `/events/${after.id}`,
  };
}

export function buildEventCancellationMessage(event: EventRecord): DeliveryMessage {
  return {
    title: `Event canceled: ${event.title}`,
    body: `${event.title} on ${formatEventDateTime(event.startTime)} has been canceled.`,
    link: "/calendar",
  };
}

export function buildSeriesCancellationMessage(
  events: EventRecord[],
  user: Pick<Recipient, "role" | "podId">,
): DeliveryMessage | null {
  const visibleEvents = events
    .filter((event) => isEventAudienceMember(event, user))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  if (visibleEvents.length === 0) return null;
  const first = visibleEvents[0];
  return {
    title: "Event series canceled",
    body: [
      `${visibleEvents.length} upcoming event${visibleEvents.length === 1 ? "" : "s"} ${visibleEvents.length === 1 ? "has" : "have"} been canceled.`,
      `First canceled event: ${first.title}`,
      `Starts: ${formatEventDateTime(first.startTime)}`,
    ].join("\n"),
    link: "/calendar",
  };
}

export async function notifyEventCanceled(event: EventRecord): Promise<void> {
  if (event.startTime.getTime() <= Date.now()) return;
  const users = await db.select().from(usersTable);
  const recipients = users.filter((user) =>
    Object.values(getEventChangeDeliveryChannels(user)).some(Boolean)
    && isEventAudienceMember(event, user));
  const orgPrefix = await getShortNamePrefix();
  const message = buildEventCancellationMessage(event);
  await Promise.allSettled(recipients.map(async (user) => {
    try {
      await deliver(user, message.title, message.body, message.link, `${orgPrefix}${message.title}`);
    } catch (err) {
      logger.error({ err, eventId: event.id, userId: user.id }, "[event-cancellations] delivery failed");
    }
  }));
}

export async function notifySeriesCanceled(events: EventRecord[]): Promise<void> {
  if (events.length === 0) return;
  const users = await db.select().from(usersTable);
  const orgPrefix = await getShortNamePrefix();
  await Promise.allSettled(users.map(async (user) => {
    if (!Object.values(getEventChangeDeliveryChannels(user)).some(Boolean)) return;
    const message = buildSeriesCancellationMessage(events, user);
    if (!message) return;
    try {
      await deliver(user, message.title, message.body, message.link, `${orgPrefix}${message.title}`);
    } catch (err) {
      logger.error({ err, seriesId: events[0].seriesId, userId: user.id }, "[event-cancellations] series delivery failed");
    }
  }));
}

export function buildSeriesRescheduleMessage(
  beforeEvents: EventRecord[],
  afterEvents: EventRecord[],
  shiftDays: number,
  user: Pick<Recipient, "role" | "podId">,
): DeliveryMessage | null {
  const pairs = beforeEvents
    .map((before, index) => ({ before, after: afterEvents[index] }))
    .filter((pair): pair is { before: EventRecord; after: EventRecord } =>
      Boolean(pair.after) && isEventAudienceMember(pair.before, user))
    .sort((a, b) => a.before.startTime.getTime() - b.before.startTime.getTime());
  if (pairs.length === 0) return null;
  const first = pairs[0];
  const count = pairs.length;
  const days = Math.abs(shiftDays);
  const direction = shiftDays > 0
    ? `${days} day${days === 1 ? "" : "s"} later`
    : `${days} day${days === 1 ? "" : "s"} earlier`;
  return {
    title: "Event series rescheduled",
    body: [
      `${count} upcoming event${count === 1 ? "" : "s"} ${count === 1 ? "was" : "were"} moved ${direction}.`,
      `First event: ${first.before.title}`,
      `${formatEventDateTime(first.before.startTime)} → ${formatEventDateTime(first.after.startTime)}`,
    ].join("\n"),
    link: "/calendar",
  };
}

export async function notifySeriesRescheduled(
  beforeEvents: EventRecord[],
  afterEvents: EventRecord[],
  shiftDays: number,
): Promise<void> {
  if (beforeEvents.length === 0 || afterEvents.length === 0) return;
  const users = await db.select().from(usersTable);
  const orgPrefix = await getShortNamePrefix();
  await Promise.allSettled(users.map(async (user) => {
    if (!Object.values(getEventChangeDeliveryChannels(user)).some(Boolean)) return;
    const message = buildSeriesRescheduleMessage(beforeEvents, afterEvents, shiftDays, user);
    if (!message) return;
    try {
      await deliver(user, message.title, message.body, message.link, `${orgPrefix}${message.title}`);
    } catch (err) {
      logger.error({ err, seriesId: beforeEvents[0].seriesId, userId: user.id }, "[event-changes] series delivery failed");
    }
  }));
}