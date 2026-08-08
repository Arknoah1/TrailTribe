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

if (transporter) {
  transporter.verify()
    .then(() => {
      logger.info("[email] SMTP connection verified successfully");
      emailHealthy = true;
    })
    .catch((err: unknown) => {
      logger.error({ err }, "[email] SMTP verify failed — emails will not be delivered");
      emailHealthy = false;
    });
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
