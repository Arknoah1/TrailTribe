import { describe, expect, it } from "vitest";
import { DEFAULT_FROM_ADDRESS, resolveFromAddress } from "./emailIdentity";

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
});
