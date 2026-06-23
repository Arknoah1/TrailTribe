import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  logger.warn("[email] RESEND_API_KEY is not set — all email sending is disabled");
}

const resend = apiKey ? new Resend(apiKey) : null;

export const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "TrailTribe <onboarding@resend.dev>";

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
  if (!resend) {
    logger.warn({ to: opts.to, subject: opts.subject }, "[email] skipping send — no API key");
    return { status: "skipped", reason: "no_api_key" };
  }
  try {
    const toArray = Array.isArray(opts.to) ? opts.to : [opts.to];
    const filtered = toArray.filter((e) => e && !e.endsWith("@trailtribe.internal") && !e.endsWith("@pending.trailtribe.app"));
    if (filtered.length === 0) {
      logger.info({ subject: opts.subject }, "[email] no valid recipients — skipping");
      return { status: "skipped", reason: "no_valid_recipients" };
    }
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: filtered,
      subject: opts.subject,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error) {
      logger.error({ error, subject: opts.subject }, "[email] Resend error");
      return { status: "failed", error };
    } else {
      logger.info({ to: filtered, subject: opts.subject }, "[email] sent");
      return { status: "sent" };
    }
  } catch (err) {
    logger.error({ err, subject: opts.subject }, "[email] unexpected error");
    return { status: "failed", error: err };
  }
}
