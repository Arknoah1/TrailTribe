import { describe, expect, it } from "vitest";
import { DEFAULT_FROM_ADDRESS, resolveFromAddress } from "./emailIdentity";

describe("transactional email identity", () => {
  it("uses the Methow Cycling Team display name in the fallback sender", () => {
    expect(DEFAULT_FROM_ADDRESS).toBe("Methow Cycling Team <admin@methowcyclingteam.com>");
  });

  it("uses a complete configured From header when an override is provided", () => {
    expect(resolveFromAddress("  Custom Sender <custom@example.com>  ")).toBe(
      "Custom Sender <custom@example.com>",
    );
    expect(resolveFromAddress("")).toBe(DEFAULT_FROM_ADDRESS);
    expect(resolveFromAddress(null)).toBe(DEFAULT_FROM_ADDRESS);
  });
});
