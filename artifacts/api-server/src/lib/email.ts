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
    logger.error({ err, subject: opts.subject }, "[email] unexpected error");
    return { status: "failed", error: err };
  }
}
