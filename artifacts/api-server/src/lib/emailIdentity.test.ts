import { describe, expect, it } from "vitest";
import { DEFAULT_FROM_ADDRESS } from "./emailIdentity";

describe("transactional email identity", () => {
  it("uses the TrailTeam display name in the fallback sender", () => {
    expect(DEFAULT_FROM_ADDRESS).toBe("TrailTeam <noreply@trailteam.app>");
  });
});