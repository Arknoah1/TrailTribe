import { describe, expect, it } from "vitest";
import {
  APPROVED_SENDER_NAME,
  DEFAULT_FROM_ADDRESS,
  resolveApprovedSenderMailboxes,
  resolveFromAddress,
  validateFromAddress,
} from "./emailIdentity";

const EXPECTED_CONFIGURED_FROM_ADDRESS =
  "Methow Cycling Team <coaches@methowcyclingteam.com>";

describe("transactional email identity", () => {
  it("uses the Methow Cycling Team display name in the fallback sender", () => {
    expect(DEFAULT_FROM_ADDRESS).toBe("Methow Cycling Team <admin@methowcyclingteam.com>");
    expect(DEFAULT_FROM_ADDRESS).not.toContain("TrailTeam");
  });

  it("keeps the effective configured sender on the verified mailbox with the current display name", () => {
    expect(process.env.EMAIL_FROM).toBeDefined();

    const effectiveFromAddress = resolveFromAddress(process.env.EMAIL_FROM);

    expect(effectiveFromAddress).toBe(EXPECTED_CONFIGURED_FROM_ADDRESS);
    expect(effectiveFromAddress).toContain("coaches@methowcyclingteam.com");
    expect(effectiveFromAddress).not.toContain("TrailTeam");
  });

  it("falls back when the configured sender is blank or missing", () => {
    expect(resolveFromAddress("")).toBe(DEFAULT_FROM_ADDRESS);
    expect(resolveFromAddress(null)).toBe(DEFAULT_FROM_ADDRESS);
    expect(resolveFromAddress(undefined)).toBe(DEFAULT_FROM_ADDRESS);
  });

  it("accepts approved configured identities", () => {
    expect(resolveFromAddress("  Methow Cycling Team <coaches@methowcyclingteam.com>  ")).toBe(
      "Methow Cycling Team <coaches@methowcyclingteam.com>",
    );
    expect(resolveFromAddress("Methow Cycling Team <admin@methowcyclingteam.com>")).toBe(
      DEFAULT_FROM_ADDRESS,
    );
  });

  it("accepts a verified mailbox from deployment configuration", () => {
    const configuredMailboxes = process.env.EMAIL_APPROVED_SENDER_MAILBOXES;
    process.env.EMAIL_APPROVED_SENDER_MAILBOXES =
      "billing@methowcyclingteam.com, operations@methowcyclingteam.com";

    try {
      expect(
        resolveFromAddress(
          "Methow Cycling Team <billing@methowcyclingteam.com>",
        ),
      ).toBe("Methow Cycling Team <billing@methowcyclingteam.com>");
      expect(() =>
        resolveFromAddress("Methow Cycling Team <coaches@methowcyclingteam.com>"),
      ).toThrow(/approved sender mailbox/);
    } finally {
      if (configuredMailboxes === undefined) {
        delete process.env.EMAIL_APPROVED_SENDER_MAILBOXES;
      } else {
        process.env.EMAIL_APPROVED_SENDER_MAILBOXES = configuredMailboxes;
      }
    }
  });

  it("rejects an invalid deployment mailbox allowlist", () => {
    expect(() =>
      resolveApprovedSenderMailboxes(
        "billing@methowcyclingteam.com, not-a-mailbox",
      ),
    ).toThrow(/EMAIL_APPROVED_SENDER_MAILBOXES/);
  });

  it("rejects stale branding and unapproved sender mailboxes", () => {
    expect(() =>
      validateFromAddress("TrailTeam <coaches@methowcyclingteam.com>"),
    ).toThrow(
      `Invalid EMAIL_FROM "TrailTeam <coaches@methowcyclingteam.com>". Expected the display name "${APPROVED_SENDER_NAME}"`,
    );
    expect(() =>
      resolveFromAddress("Methow Cycling Team <noreply@trailteam.app>"),
    ).toThrow(/approved sender mailbox/);
    expect(() => resolveFromAddress("coaches@methowcyclingteam.com")).toThrow(
      /Invalid EMAIL_FROM/,
    );
  });
});
