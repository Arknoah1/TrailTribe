import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pool } from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.headers["x-test-clerk-user-id"];
    next();
  },
}));
vi.mock("../lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ status: "sent" }) }));
vi.mock("./settings", () => ({ getShortNamePrefix: vi.fn().mockResolvedValue("") }));
vi.mock("../lib/emailLinks", () => ({
  addEmailLinks: vi.fn((message: string) => ({ text: message, html: message })),
  createEmailLink: vi.fn(),
}));

const runId = `carpool-db-race-${process.pid}-${Date.now()}`;
let server: Server;
let baseUrl: string;
let eventId: number;
let driverId: number;
let driverClerkId: string;
let riders: Array<{ id: number; clerkId: string }>;

async function createOffer(seats: number) {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO carpool_offers (event_id, driver_user_id, available_seats, bike_tray_count)
     VALUES ($1, $2, $3, 0) RETURNING id`,
    [eventId, driverId, seats],
  );
  return result.rows[0].id;
}

async function createRequest(rider: { id: number }) {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO carpool_requests (event_id, rider_user_id, requested_by_user_id, status)
     VALUES ($1, $2, $2, 'open') RETURNING id`,
    [eventId, rider.id],
  );
  return result.rows[0].id;
}

async function request(
  path: string,
  method: string,
  clerkId: string,
  body?: Record<string, unknown>,
) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "x-test-clerk-user-id": clerkId,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function expectOneSuccess(responses: Promise<Response>[], successStatuses: number[]) {
  const resolved = await Promise.all(responses);
  const successes = resolved.filter((response) => successStatuses.includes(response.status));
  const conflicts = resolved.filter((response) => response.status === 409);
  expect(successes).toHaveLength(1);
  expect(conflicts).toHaveLength(1);
  return resolved;
}

beforeAll(async () => {
  const insertedUsers = await pool.query<{ id: number; clerk_user_id: string }>(
    `INSERT INTO users (first_name, last_name, email, role, approved, clerk_user_id)
     SELECT 'Race', label, $1 || '-' || label || '@example.test', role, true, $1 || '-' || label
     FROM (VALUES
       ('driver', 'parent'), ('rider-1', 'student'), ('rider-2', 'student'),
       ('rider-3', 'student'), ('rider-4', 'student'), ('rider-5', 'student'),
       ('rider-6', 'student'), ('rider-7', 'student')
     ) AS fixture(label, role)
     RETURNING id, clerk_user_id`,
    [runId],
  );
  [driverId, driverClerkId] = [insertedUsers.rows[0].id, insertedUsers.rows[0].clerk_user_id];
  riders = insertedUsers.rows.slice(1).map((row) => ({ id: row.id, clerkId: row.clerk_user_id }));
  const event = await pool.query<{ id: number }>(
    `INSERT INTO events (title, start_time, ical_uid)
     VALUES ($1, now() + interval '1 day', $2) RETURNING id`,
    [`Carpool race ${runId}`, `${runId}@example.test`],
  );
  eventId = event.rows[0].id;

  const { default: router } = await import("./carpools");
  const app = express();
  app.use(express.json());
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await pool.query("DELETE FROM carpool_requests WHERE event_id = $1", [eventId]);
  await pool.query("DELETE FROM carpool_offers WHERE event_id = $1", [eventId]);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (eventId) await pool.query("DELETE FROM events WHERE id = $1", [eventId]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${runId}-%@example.test`]);
  await pool.end();
});

describe.sequential("real PostgreSQL carpool route races", () => {
  it("serializes claim against claim for the final seat", async () => {
    const offerId = await createOffer(1);
    await expectOneSuccess([
      request(`/carpools/${offerId}/claims`, "POST", riders[0].clerkId, {}),
      request(`/carpools/${offerId}/claims`, "POST", riders[1].clerkId, {}),
    ], [201]);
    expect((await pool.query("SELECT id FROM carpool_claims WHERE carpool_offer_id = $1", [offerId])).rows)
      .toHaveLength(1);
  });

  it("serializes a direct claim against a driver match for the final seat", async () => {
    const offerId = await createOffer(1);
    const requestId = await createRequest(riders[2]);
    await expectOneSuccess([
      request(`/carpools/${offerId}/claims`, "POST", riders[3].clerkId, {}),
      request(`/carpool-requests/${requestId}/match`, "POST", driverClerkId, { offerId }),
    ], [200, 201]);
    expect((await pool.query("SELECT id FROM carpool_claims WHERE carpool_offer_id = $1", [offerId])).rows)
      .toHaveLength(1);
  });

  it("serializes two driver matches for the final seat", async () => {
    const offerId = await createOffer(1);
    const firstRequestId = await createRequest(riders[4]);
    const secondRequestId = await createRequest(riders[5]);
    await expectOneSuccess([
      request(`/carpool-requests/${firstRequestId}/match`, "POST", driverClerkId, { offerId }),
      request(`/carpool-requests/${secondRequestId}/match`, "POST", driverClerkId, { offerId }),
    ], [200]);
    expect((await pool.query("SELECT id FROM carpool_claims WHERE carpool_offer_id = $1", [offerId])).rows)
      .toHaveLength(1);
  });

  it("serializes a zero-seat edit against a claim", async () => {
    const offerId = await createOffer(1);
    await expectOneSuccess([
      request(`/carpools/${offerId}`, "PATCH", driverClerkId, { availableSeats: 0 }),
      request(`/carpools/${offerId}/claims`, "POST", riders[0].clerkId, {}),
    ], [200, 201]);
    const final = await pool.query<{ available_seats: number; claims: string }>(
      `SELECT offer.available_seats, COUNT(claim.id)::text AS claims
       FROM carpool_offers offer
       LEFT JOIN carpool_claims claim ON claim.carpool_offer_id = offer.id
       WHERE offer.id = $1 GROUP BY offer.id`,
      [offerId],
    );
    expect(Number(final.rows[0].claims)).toBeLessThanOrEqual(final.rows[0].available_seats);
  });

  it("serializes deleting an open request against matching it", async () => {
    const offerId = await createOffer(1);
    const requestId = await createRequest(riders[1]);
    await expectOneSuccess([
      request(`/carpool-requests/${requestId}`, "DELETE", riders[1].clerkId),
      request(`/carpool-requests/${requestId}/match`, "POST", driverClerkId, { offerId }),
    ], [200, 204]);
    const persistedRequest = await pool.query<{ status: string }>(
      "SELECT status FROM carpool_requests WHERE id = $1",
      [requestId],
    );
    const claims = await pool.query("SELECT id FROM carpool_claims WHERE carpool_offer_id = $1", [offerId]);
    expect(
      (persistedRequest.rows.length === 0 && claims.rows.length === 0) ||
      (persistedRequest.rows[0]?.status === "matched" && claims.rows.length === 1),
    ).toBe(true);
  });

  it("rolls back the real match request update and auto-created offer when its claim conflicts", async () => {
    const requestId = await createRequest(riders[2]);
    const existingOfferId = await createOffer(1);
    expect((await request(`/carpools/${existingOfferId}/claims`, "POST", riders[2].clerkId, {})).status).toBe(201);
    const offersBefore = Number((await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM carpool_offers WHERE event_id = $1",
      [eventId],
    )).rows[0].count);

    const response = await request(`/carpool-requests/${requestId}/match`, "POST", driverClerkId, {});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/already has a driver/i) });

    const persistedRequest = await pool.query<{ status: string; matched_offer_id: number | null }>(
      "SELECT status, matched_offer_id FROM carpool_requests WHERE id = $1",
      [requestId],
    );
    const offersAfter = Number((await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM carpool_offers WHERE event_id = $1",
      [eventId],
    )).rows[0].count);
    expect(persistedRequest.rows[0]).toEqual({ status: "open", matched_offer_id: null });
    expect(offersAfter).toBe(offersBefore);
  });
});