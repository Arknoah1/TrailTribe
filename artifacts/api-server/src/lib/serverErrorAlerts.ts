import { createHash } from "node:crypto";
import type { Request } from "express";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

const WINDOW_MS = 5 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const ALERT_THRESHOLD = 3;
const MAX_TRACKED_FINGERPRINTS = 500;

type Incident = {
  occurrences: number[];
  requestIds: string[];
  lastAlertAt: number | null;
};

const incidents = new Map<string, Incident>();

function routeContext(req: Request): string {
  const rawPath = req.originalUrl || req.url || req.path || "unknown";
  return `${req.method || "UNKNOWN"} ${rawPath.split("?")[0]}`;
}

function errorSignature(err: unknown): string {
  if (!(err instanceof Error)) return typeof err;

  const topFrame = err.stack
    ?.split("\n")
    .slice(1)
    .map((line) => line.trim().replace(/:\d+:\d+\)?$/, ")"))
    .find(Boolean);

  return [err.name, err.message, topFrame ?? ""].join("|");
}

export function fingerprintServerError(err: unknown, req: Request): string {
  return createHash("sha256")
    .update(`${routeContext(req)}|${errorSignature(err)}`)
    .digest("hex")
    .slice(0, 16);
}

async function notifyAdmins(alert: {
  fingerprint: string;
  route: string;
  requestIds: string[];
  occurrences: number;
}): Promise<void> {
  const admins = await db.query.usersTable.findMany({
    where: and(eq(usersTable.role, "super_admin"), eq(usersTable.isActive, true)),
  });
  if (admins.length === 0) return;

  const title = "Repeated server error needs attention";
  const body = [
    `${alert.occurrences} matching server errors occurred within five minutes.`,
    `Route: ${alert.route}`,
    `Fingerprint: ${alert.fingerprint}`,
    `Request IDs: ${alert.requestIds.join(", ")}`,
  ].join("\n");

  const inAppNotifications = admins
    .filter((admin) => admin.notificationsEnabled)
    .map((admin) => ({
        recipientUserId: admin.id,
        type: "repeated_server_error",
        title,
        body,
        link: null,
        isRead: false,
      }));
  if (inAppNotifications.length > 0) {
    await db.insert(notificationsTable).values(inAppNotifications);
  }

  const emailRecipients = admins
    .filter((admin) => admin.emailNotifications && admin.email)
    .map((admin) => admin.email);

  if (emailRecipients.length > 0) {
    await sendEmail({
      to: emailRecipients,
      subject: `[TrailTeam] ${title}`,
      text: `${body}\n\nNo request bodies, credentials, or error details are included in this alert.`,
    });
  }
}

export function recordUnhandledServerError(
  err: unknown,
  req: Request,
  now = Date.now(),
): void {
  const fingerprint = fingerprintServerError(err, req);
  const cutoff = now - WINDOW_MS;
  const requestId = String(req.id ?? "unknown");
  const existing = incidents.get(fingerprint) ?? {
    occurrences: [],
    requestIds: [],
    lastAlertAt: null,
  };

  existing.occurrences = existing.occurrences.filter((timestamp) => timestamp >= cutoff);
  existing.occurrences.push(now);
  existing.requestIds = [...existing.requestIds, requestId].slice(-ALERT_THRESHOLD);
  incidents.delete(fingerprint);
  incidents.set(fingerprint, existing);

  while (incidents.size > MAX_TRACKED_FINGERPRINTS) {
    const oldest = incidents.keys().next().value;
    if (!oldest) break;
    incidents.delete(oldest);
  }

  const isRepeated = existing.occurrences.length >= ALERT_THRESHOLD;
  const cooldownElapsed =
    existing.lastAlertAt === null || now - existing.lastAlertAt >= ALERT_COOLDOWN_MS;
  if (!isRepeated || !cooldownElapsed) return;

  existing.lastAlertAt = now;
  const alert = {
    fingerprint,
    route: routeContext(req),
    requestIds: existing.requestIds,
    occurrences: existing.occurrences.length,
  };

  logger.error(alert, "Repeated unhandled server error");
  void notifyAdmins(alert).catch((alertError) => {
    logger.error(
      { err: alertError, fingerprint },
      "Failed to deliver repeated server error alert",
    );
  });
}

export function resetServerErrorAlertsForTests(): void {
  incidents.clear();
}