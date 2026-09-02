import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: "sender-verification" }),
  verify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => smtp),
  },
}));

const originalEnv = {
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_APPROVED_SENDER_MAILBOXES:
    process.env.EMAIL_APPROVED_SENDER_MAILBOXES,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_USER: process.env.SMTP_USER,
};

let email: typeof import("./email");

beforeAll(async () => {
  process.env.SMTP_USER = "admin@methowcyclingteam.com";
  process.env.SMTP_PASS = "test-only-password";
  email = await import("./email");
});

afterAll(() => {
  email.stopEmailHealthCheck();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("transactional email headers", () => {
  it("sends the effective configured identity and preserves Reply-To", async () => {
    const configuredFromAddress = process.env.EMAIL_FROM;
    const expectedFromAddress = "Methow Cycling Team <coaches@methowcyclingteam.com>";
    process.env.EMAIL_FROM = expectedFromAddress;

    try {
      const result = await email.sendEmail({
        to: "family@example.com",
        subject: "Sender verification",
        text: "Verification message",
        replyTo: "coach@example.com",
      });

      expect(result).toEqual({ status: "sent" });
      expect(smtp.sendMail).toHaveBeenCalledWith({
        from: expectedFromAddress,
        to: ["family@example.com"],
        subject: "Sender verification",
        text: "Verification message",
        replyTo: "coach@example.com",
      });
    } finally {
      if (configuredFromAddress === undefined) {
        delete process.env.EMAIL_FROM;
      } else {
        process.env.EMAIL_FROM = configuredFromAddress;
      }
    }
  });

  it("refuses to send if EMAIL_FROM changes to an unapproved identity", async () => {
    const configuredFromAddress = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = "TrailTeam <noreply@trailteam.app>";

    try {
      const result = await email.sendEmail({
        to: "family@example.com",
        subject: "Invalid sender",
        text: "This must not be sent",
      });

      expect(result.status).toBe("failed");
      expect(smtp.sendMail).not.toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Invalid sender" }),
      );
    } finally {
      if (configuredFromAddress === undefined) {
        delete process.env.EMAIL_FROM;
      } else {
        process.env.EMAIL_FROM = configuredFromAddress;
      }
    }
  });

  it("sends from a mailbox approved by deployment configuration", async () => {
    const configuredFromAddress = process.env.EMAIL_FROM;
    const configuredMailboxes = process.env.EMAIL_APPROVED_SENDER_MAILBOXES;
    process.env.EMAIL_APPROVED_SENDER_MAILBOXES =
      "billing@methowcyclingteam.com";
    process.env.EMAIL_FROM =
      "Methow Cycling Team <billing@methowcyclingteam.com>";
    smtp.sendMail.mockClear();

    try {
      const result = await email.sendEmail({
        to: "family@example.com",
        subject: "Rotated sender",
        text: "This uses the configured verified mailbox",
      });

      expect(result).toEqual({ status: "sent" });
      expect(smtp.sendMail).toHaveBeenCalledWith({
        from: "Methow Cycling Team <billing@methowcyclingteam.com>",
        to: ["family@example.com"],
        subject: "Rotated sender",
        text: "This uses the configured verified mailbox",
      });
    } finally {
      if (configuredFromAddress === undefined) {
        delete process.env.EMAIL_FROM;
      } else {
        process.env.EMAIL_FROM = configuredFromAddress;
      }
      if (configuredMailboxes === undefined) {
        delete process.env.EMAIL_APPROVED_SENDER_MAILBOXES;
      } else {
        process.env.EMAIL_APPROVED_SENDER_MAILBOXES = configuredMailboxes;
      }
    }
  });
});