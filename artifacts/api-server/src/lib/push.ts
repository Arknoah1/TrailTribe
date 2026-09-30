import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db, pushDevicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Firebase Admin credentials are supplied as a base64-encoded service account
 * JSON key (FIREBASE_SERVICE_ACCOUNT_BASE64) rather than a raw JSON env var —
 * this avoids the multi-line `private_key` field getting mangled by env var
 * escaping, same rationale as the base64-encoded Android signing keystore
 * used in CI. Generate the key from Firebase Console → Project settings →
 * Service accounts → Generate new private key, then base64-encode the file.
 */
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

let firebaseApp: App | null = null;

if (!serviceAccountBase64) {
  logger.warn("[push] FIREBASE_SERVICE_ACCOUNT_BASE64 is not set — push notifications are disabled");
} else {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountBase64, "base64").toString("utf8"),
    );
    firebaseApp =
      getApps().length > 0 ? getApps()[0]! : initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    logger.error(
      { err },
      "[push] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64 — push notifications disabled",
    );
  }
}

export interface SendPushOptions {
  /** Internal user id (usersTable.id) to deliver to — all of that user's registered devices are notified. */
  userId: number;
  title: string;
  body: string;
  /** App-relative deep link, e.g. "/events/123" — delivered as a data payload, not a notification click action. */
  link?: string;
}

export type PushResult =
  | { status: "sent"; successCount: number; failureCount: number }
  | { status: "skipped"; reason: "no_credentials" | "no_devices" }
  | { status: "failed"; error: unknown };

/**
 * Best-effort push send to every device registered for a user. Never throws —
 * callers (notably createNotification) should not have their own operation
 * fail because a push provider hiccupped.
 */
export async function sendPushNotification(opts: SendPushOptions): Promise<PushResult> {
  if (!firebaseApp) {
    return { status: "skipped", reason: "no_credentials" };
  }

  let devices;
  try {
    devices = await db.query.pushDevicesTable.findMany({
      where: eq(pushDevicesTable.userId, opts.userId),
    });
  } catch (err) {
    logger.error({ err, userId: opts.userId }, "[push] failed to load device tokens");
    return { status: "failed", error: err };
  }

  if (devices.length === 0) {
    return { status: "skipped", reason: "no_devices" };
  }

  try {
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens: devices.map((d) => d.token),
      notification: {
        title: opts.title,
        body: opts.body,
      },
      ...(opts.link ? { data: { link: opts.link } } : {}),
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });

    // Self-heal: a token stops being valid when the app is uninstalled or the
    // OS rotates it. Without cleanup these accumulate forever and every send
    // keeps re-failing against them.
    const staleTokens = response.responses
      .map((res, i) => ({ res, token: devices[i]!.token }))
      .filter(({ res }) => {
        const code = (res.error as { code?: string } | undefined)?.code;
        return (
          !res.success &&
          (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument")
        );
      })
      .map(({ token }) => token);

    if (staleTokens.length > 0) {
      const results = await Promise.allSettled(
        staleTokens.map((token) => db.delete(pushDevicesTable).where(eq(pushDevicesTable.token, token))),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      logger.info(
        { removed: staleTokens.length - failed, userId: opts.userId },
        "[push] removed stale device token(s)",
      );
    }

    logger.info(
      { userId: opts.userId, successCount: response.successCount, failureCount: response.failureCount },
      "[push] sent",
    );
    return { status: "sent", successCount: response.successCount, failureCount: response.failureCount };
  } catch (err) {
    logger.error({ err, userId: opts.userId }, "[push] unexpected error sending");
    return { status: "failed", error: err };
  }
}
