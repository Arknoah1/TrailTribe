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

  it("passes verified inline image bytes through as a MIME attachment with its CID", async () => {
    const configuredFromAddress = process.env.EMAIL_FROM;
    const attachments = [{
      filename: "broadcast-image-1.png",
      content: Buffer.from("verified image bytes"),
      contentType: "image/png",
      cid: "broadcast-42-0@trailteam",
    }];
    process.env.EMAIL_FROM = "Methow Cycling Team <coaches@methowcyclingteam.com>";
    smtp.sendMail.mockClear();

    try {
      const result = await email.sendEmail({
        to: "family@example.com",
        subject: "Broadcast with an image",
        text: "A picture is attached.",
        html: '<img src="cid:broadcast-42-0@trailteam">',
        attachments,
      });
      expect(result).toEqual({ status: "sent" });
      expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        attachments,
        html: '<img src="cid:broadcast-42-0@trailteam">',
      }));
    } finally {
      if (configuredFromAddress === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = configuredFromAddress;
    }
  });
});
describe("temporary SMTP failures", () => {
  const send = () => email.sendEmail({
    to: "family@example.com",
    subject: "Retry check",
    text: "Body",
  });

  async function withFastRetries(run: () => Promise<void>) {
    const previous = process.env.EMAIL_RETRY_DELAYS_MS;
    const previousFrom = process.env.EMAIL_FROM;
    process.env.EMAIL_RETRY_DELAYS_MS = "0,0";
    process.env.EMAIL_FROM = "Methow Cycling Team <coaches@methowcyclingteam.com>";
    smtp.sendMail.mockReset();
    smtp.sendMail.mockResolvedValue({ messageId: "ok" });
    try {
      await run();
    } finally {
      if (previous === undefined) delete process.env.EMAIL_RETRY_DELAYS_MS;
      else process.env.EMAIL_RETRY_DELAYS_MS = previous;
      if (previousFrom === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = previousFrom;
    }
  }

  it("retries Gmail's 421-4.3.0 rate limit and then delivers", async () => {
    await withFastRetries(async () => {
      smtp.sendMail.mockRejectedValueOnce(
        Object.assign(new Error("421-4.3.0 Temporary System Problem"), { responseCode: 421 }),
      );
      await expect(send()).resolves.toEqual({ status: "sent" });
      expect(smtp.sendMail).toHaveBeenCalledTimes(2);
    });
  });

  it("retries dropped connections", async () => {
    await withFastRetries(async () => {
      smtp.sendMail.mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }));
      await expect(send()).resolves.toEqual({ status: "sent" });
      expect(smtp.sendMail).toHaveBeenCalledTimes(2);
    });
  });

  it("gives up after the configured retries and reports the failure", async () => {
    await withFastRetries(async () => {
      const failure = Object.assign(new Error("421 try later"), { responseCode: 421 });
      smtp.sendMail.mockRejectedValue(failure);
      await expect(send()).resolves.toEqual({ status: "failed", error: failure });
      expect(smtp.sendMail).toHaveBeenCalledTimes(3);
    });
  });

  it("does not retry permanent rejections or authentication failures", async () => {
    await withFastRetries(async () => {
      smtp.sendMail.mockRejectedValue(Object.assign(new Error("550 no such user"), { responseCode: 550 }));
      await expect(send()).resolves.toMatchObject({ status: "failed" });
      expect(smtp.sendMail).toHaveBeenCalledTimes(1);

      smtp.sendMail.mockReset();
      smtp.sendMail.mockRejectedValue(Object.assign(new Error("bad login"), { code: "EAUTH" }));
      await expect(send()).resolves.toMatchObject({ status: "failed" });
      expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    });
  });
});
