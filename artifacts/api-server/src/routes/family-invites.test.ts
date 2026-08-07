/**
 * Integration-level tests for the family-invites router.
 *
 * Mounts the real Express router with stubbed I/O (database, email, auth, settings)
 * and asserts that the invite URL placed in outgoing emails — and returned in the
 * response body — is a valid absolute URL whenever the environment is configured.
 *
 * Run via: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

/* ─── captured state ─────────────────────────────────────────────────── */

// Collected by the sendEmail spy; reset before each test.
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

/* ─── module mocks ───────────────────────────────────────────────────── */

// vi.mock() calls are hoisted before any import, so these stubs are in place
// when family-invites.ts is first evaluated.

vi.mock("@workspace/db", () => {
  const mockDb = {
    query: {
      usersTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          firstName: "Coach",
          lastName: "Rivera",
          clerkUserId: "clerk_test_coach",
        }),
      },
      familyInvitesTable: {
        // No pre-existing pending invite — forces a fresh insert each time.
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })),
    })),
  };
  return {
    db: mockDb,
    // Table schema objects are only used as DSL arguments; a Proxy satisfies any access.
    familyInvitesTable: new Proxy({}, { get: () => ({}) }),
    usersTable: new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../lib/email", () => ({
  sendEmail: vi.fn(async (opts: { to: string; subject: string; text: string }) => {
    sentEmails.push(opts);
    return { status: "sent" };
  }),
}));

// Bypass real Clerk auth — inject clerkUserId so getRequester() finds a user.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
}));

vi.mock("./settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({ teamName: "Trail Blazers", shortName: "TB" }),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/* ─── import router after mocks are registered ───────────────────────── */

const { default: familyInvitesRouter } = await import("./family-invites");

/* ─── test server ───────────────────────────────────────────────────── */

const app = express();
app.use(express.json());
app.use(familyInvitesRouter);

let server: Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer(app as any);
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

/* ─── env cleanup ───────────────────────────────────────────────────── */

const ENV_KEYS = ["APP_BASE_URL", "REPLIT_DEV_DOMAIN", "FRONTEND_BASE_PATH"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
for (const key of ENV_KEYS) {
  if (process.env[key] !== undefined) savedEnv[key] = process.env[key];
}
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
    else delete process.env[key];
  }
});

beforeEach(() => {
  sentEmails.length = 0;
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

/* ─── helpers ────────────────────────────────────────────────────────── */

/** Pull the first https?:// …/family-invite/… URL from plain-text email body. */
function extractInviteUrlFromEmail(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s]+\/family-invite\/[^\s]+/)?.[0];
}

/** Assert that a string is an absolute URL with a non-empty host. */
function assertAbsoluteUrl(url: string, label = "URL"): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid absolute URL: ${url}`);
  }
  expect(parsed.host.length).toBeGreaterThan(0);
}

/* ─── POST /family-invites ───────────────────────────────────────────── */

describe("POST /family-invites — email invite", () => {
  it("email body contains a clickable URL when APP_BASE_URL is configured", async () => {
    process.env.APP_BASE_URL = "https://trailtribe.example.com";

    const resp = await fetch(`${baseUrl}/family-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: ["parent@example.com"] }),
    });

    expect(resp.status).toBe(201);
    expect(sentEmails).toHaveLength(1);

    const urlInEmail = extractInviteUrlFromEmail(sentEmails[0].text);
    expect(urlInEmail, `No invite URL found in email body:\n${sentEmails[0].text}`).toBeTruthy();

    assertAbsoluteUrl(urlInEmail!, "invite URL in email");
    expect(urlInEmail).toMatch(/^https:\/\/trailtribe\.example\.com/);
    expect(urlInEmail).toContain("/family-invite/");
  });

  it("email body contains a clickable URL when REPLIT_DEV_DOMAIN is configured", async () => {
    process.env.REPLIT_DEV_DOMAIN = "myrepl.replit.dev";

    const resp = await fetch(`${baseUrl}/family-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: ["parent@example.com"] }),
    });

    expect(resp.status).toBe(201);
    expect(sentEmails).toHaveLength(1);

    const urlInEmail = extractInviteUrlFromEmail(sentEmails[0].text);
    expect(urlInEmail, `No invite URL found in email body:\n${sentEmails[0].text}`).toBeTruthy();

    assertAbsoluteUrl(urlInEmail!, "invite URL in email");
    expect(urlInEmail).toContain("myrepl.replit.dev");
    expect(urlInEmail).toContain("/family-invite/");
  });

  it("response JSON also carries a well-formed inviteUrl when APP_BASE_URL is set", async () => {
    process.env.APP_BASE_URL = "https://trailtribe.example.com";

    const resp = await fetch(`${baseUrl}/family-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: ["parent@example.com"] }),
    });

    const body = (await resp.json()) as { results: Array<{ inviteUrl: string }> };
    const inviteUrl = body.results[0]?.inviteUrl;
    expect(inviteUrl).toBeTruthy();
    assertAbsoluteUrl(inviteUrl, "inviteUrl in response");
    expect(inviteUrl).toContain("/family-invite/");
  });
});

/* ─── POST /family-invites/generate-link ────────────────────────────── */

describe("POST /family-invites/generate-link — link-only invite", () => {
  it("returns a clickable inviteUrl when APP_BASE_URL is configured", async () => {
    process.env.APP_BASE_URL = "https://trailtribe.example.com";

    const resp = await fetch(`${baseUrl}/family-invites/generate-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(resp.status).toBe(201);
    const body = (await resp.json()) as { inviteUrl: string; token: string };
    expect(body.inviteUrl).toBeTruthy();

    assertAbsoluteUrl(body.inviteUrl, "inviteUrl in generate-link response");
    expect(body.inviteUrl).toMatch(/^https:\/\/trailtribe\.example\.com/);
    expect(body.inviteUrl).toContain("/family-invite/");
  });

  it("returns a clickable inviteUrl when REPLIT_DEV_DOMAIN is configured", async () => {
    process.env.REPLIT_DEV_DOMAIN = "myrepl.replit.dev";

    const resp = await fetch(`${baseUrl}/family-invites/generate-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(resp.status).toBe(201);
    const body = (await resp.json()) as { inviteUrl: string; token: string };
    expect(body.inviteUrl).toBeTruthy();

    assertAbsoluteUrl(body.inviteUrl, "inviteUrl in generate-link response");
    expect(body.inviteUrl).toContain("myrepl.replit.dev");
    expect(body.inviteUrl).toContain("/family-invite/");
  });
});
