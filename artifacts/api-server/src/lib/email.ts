import nodemailer from "nodemailer";
import { logger } from "./logger";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (!smtpUser || !smtpPass) {
  logger.warn("[email] SMTP_USER or SMTP_PASS is not set — all email sending is disabled");
}

const transporter =
  smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true, // SSL
        auth: { user: smtpUser, pass: smtpPass },
      })
    : null;

/**
 * Reflects the last known SMTP health state.
 * - Starts `false` and is only set to `true` after `transporter.verify()` succeeds.
 * - Returns to `false` if verify fails or a send call encounters an authentication /
 *   connection error, so runtime credential revocation is surfaced without a restart.
 */
export let emailHealthy: boolean = false;

/** Interval handle for the periodic health-check, kept so we can clear it on shutdown. */
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function runVerify(): void {
  if (!transporter) return;
  transporter.verify()
    .then(() => {
      if (!emailHealthy) {
        logger.info("[email] SMTP connection verified successfully — marking healthy");
      }
      emailHealthy = true;
    })
    .catch((err: unknown) => {
      if (emailHealthy) {
        logger.error({ err }, "[email] SMTP verify failed — marking unhealthy");
      } else {
        logger.warn({ err }, "[email] SMTP verify still failing");
      }
      emailHealthy = false;
    });
}

if (transporter) {
  // Initial check at startup
  runVerify();

  // Re-verify every 20 minutes so credential rotations are detected without a restart
  const VERIFY_INTERVAL_MS = 20 * 60 * 1000;
  _healthCheckInterval = setInterval(runVerify, VERIFY_INTERVAL_MS);
  // Don't let the interval keep the process alive on its own
  _healthCheckInterval.unref();
}

/**
 * Stop the background SMTP health-check interval.
 * Call this during graceful shutdown (SIGTERM / SIGINT) so the interval
 * doesn't prevent the process from exiting.
 */
export function stopEmailHealthCheck(): void {
  if (_healthCheckInterval !== null) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
    logger.info("[email] SMTP health-check interval stopped");
  }
}

export const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "TrailTribe <noreply@trailtribe.app>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "no_api_key" | "no_valid_recipients" }
  | { status: "failed"; error: unknown };

export async function sendEmail(opts: SendEmailOptions): Promise<EmailResult> {
  if (!transporter) {
    logger.warn({ to: opts.to, subject: opts.subject }, "[email] skipping send — no SMTP credentials");
    return { status: "skipped", reason: "no_api_key" };
  }
  try {
    const toArray = Array.isArray(opts.to) ? opts.to : [opts.to];
    const filtered = toArray.filter(
      (e) =>
        e &&
        !e.endsWith("@trailtribe.internal") &&
        !e.endsWith("@pending.trailtribe.app"),
    );
    if (filtered.length === 0) {
      logger.info({ subject: opts.subject }, "[email] no valid recipients — skipping");
      return { status: "skipped", reason: "no_valid_recipients" };
    }
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: filtered,
      subject: opts.subject,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    logger.info({ to: filtered, subject: opts.subject }, "[email] sent");
    return { status: "sent" };
  } catch (err) {
    // If the error indicates an authentication or connection failure, mark email
    // as unhealthy so the dashboard warning appears immediately.
    const code = (err as any)?.code as string | undefined;
    const responseCode = (err as any)?.responseCode as number | undefined;
    const isAuthOrConnError =
      code === "EAUTH" ||
      code === "ECONNECTION" ||
      code === "ETIMEDOUT" ||
      (responseCode !== undefined && responseCode >= 500 && responseCode < 600);
    if (isAuthOrConnError) {
      emailHealthy = false;
      logger.error({ err, subject: opts.subject }, "[email] SMTP auth/connection error — marking email unhealthy");
    } else {
      logger.error({ err, subject: opts.subject }, "[email] unexpected error");
    }
    return { status: "failed", error: err };
  }
}
