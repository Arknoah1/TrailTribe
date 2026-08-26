/**
 * Unit tests for getAppBase() — covers all three resolution branches.
 *
 * Run via: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getAppBase } from "./config";

// Env vars touched by getAppBase(); snapshot restored after the suite.
const WATCHED = ["APP_BASE_URL", "REPLIT_DEV_DOMAIN", "FRONTEND_BASE_PATH"] as const;
const saved: Partial<Record<(typeof WATCHED)[number], string>> = {};
for (const key of WATCHED) {
  if (process.env[key] !== undefined) saved[key] = process.env[key];
}

afterAll(() => {
  for (const key of WATCHED) {
    if (saved[key] !== undefined) process.env[key] = saved[key];
    else delete process.env[key];
  }
});

describe("getAppBase()", () => {
  // Wipe all three vars before each test so branches stay isolated.
  beforeEach(() => {
    for (const key of WATCHED) delete process.env[key];
  });

  it("branch 1: returns the TrailTeam public URL when configured", () => {
    process.env.APP_BASE_URL = "https://trailteam.app";
    expect(getAppBase()).toBe("https://trailteam.app");
  });

  it("branch 1: APP_BASE_URL takes priority over REPLIT_DEV_DOMAIN", () => {
    process.env.APP_BASE_URL = "https://trailteam.app";
    process.env.REPLIT_DEV_DOMAIN = "abc.replit.dev";
    expect(getAppBase()).toBe("https://trailteam.app");
  });

  it("branch 2: uses REPLIT_DEV_DOMAIN with the default base path (root)", () => {
    process.env.REPLIT_DEV_DOMAIN = "abc.replit.dev";
    // FRONTEND_BASE_PATH defaults to "/" which is stripped as a trailing slash,
    // so the result is just the bare origin.
    expect(getAppBase()).toBe("https://abc.replit.dev");
  });

  it("branch 2: honours FRONTEND_BASE_PATH when REPLIT_DEV_DOMAIN is set", () => {
    process.env.REPLIT_DEV_DOMAIN = "abc.replit.dev";
    process.env.FRONTEND_BASE_PATH = "/custom-path";
    expect(getAppBase()).toBe("https://abc.replit.dev/custom-path");
  });

  it("branch 3: returns empty string when neither APP_BASE_URL nor REPLIT_DEV_DOMAIN is set", () => {
    expect(getAppBase()).toBe("");
  });

  it("branch 3: empty base produces a relative-only (hostless) invite URL — documents the misconfiguration risk", () => {
    const base = getAppBase(); // ""
    const inviteUrl = `${base}/family-invite/sometoken`;
    expect(inviteUrl).toBe("/family-invite/sometoken");
    expect(inviteUrl.startsWith("http")).toBe(false);
  });
});
