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
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_USER: process.env.SMTP_USER,
};

let email: typeof import("./email");

beforeAll(async () => {
  process.env.EMAIL_FROM = "Methow Cycling Team <coaches@methowcyclingteam.com>";
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
  it("sends the configured Methow Cycling Team identity and preserves Reply-To", async () => {
    const result = await email.sendEmail({
      to: "family@example.com",
      subject: "Sender verification",
      text: "Verification message",
      replyTo: "coach@example.com",
    });

    expect(result).toEqual({ status: "sent" });
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: "Methow Cycling Team <coaches@methowcyclingteam.com>",
      to: ["family@example.com"],
      subject: "Sender verification",
      text: "Verification message",
      replyTo: "coach@example.com",
    });
  });
});