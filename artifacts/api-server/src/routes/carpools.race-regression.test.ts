/**
 * Regression coverage for carpool claim/match uniqueness races.  Kept separate
 * from carpools.test.ts so its authorization-oriented mocks remain untouched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";

const OFFER_ID = 41;
const EVENT_ID = 91;
const DRIVER_ID = 7;
const RIDER_ID = 8;

const driver = {
  id: DRIVER_ID,
  clerkUserId: "driver-clerk",
  firstName: "Drew",
  lastName: "Driver",
  email: "driver@example.test",
  emailNotifications: true,
  role: "parent",
  householdId: 1,
};
const rider = {
  id: RIDER_ID,
  clerkUserId: "rider-clerk",
  firstName: "Riley",
  lastName: "Rider",
  role: "student",
  householdId: 1,
};
const offer = {
  id: OFFER_ID,
  eventId: EVENT_ID,
  driverUserId: DRIVER_ID,
  availableSeats: 2,
  bikeTrayCount: 1,
};
const openRequest = {
  id: 51,
  eventId: EVENT_ID,
  riderUserId: RIDER_ID,
  requestedByUserId: RIDER_ID,
  needsBikeTray: false,
  notes: null,
  status: "open",
};

const state = vi.hoisted(() => ({
  clerkUserId: "rider-clerk",
  insertError: null as any,
  matchTransitionRejected: false,
  requestNeedsBikeTray: false,
  insertedClaims: [] as any[],
  createdOffers: [] as any[],
  deletedRequests: [] as any[],
  existingClaims: [] as any[],
  capacityLock: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
  email: vi.fn().mockResolvedValue({ status: "sent" }),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ __name: name } as any, {
    get(target, property) {
      if (property === "__name") return target.__name;
      return {};
    },
  });
  const usersTable = table("users");
  const carpoolOffersTable = table("offers");
  const carpoolClaimsTable = table("claims");
  const carpoolRequestsTable = table("requests");
  const eventsTable = table("events");
  const findUser = vi.fn(() =>
    Promise.resolve(state.clerkUserId === "driver-clerk" ? driver : rider),
  );
  const findOffer = vi.fn().mockResolvedValue(offer);
  const currentRequest = () => ({
    ...openRequest,
    needsBikeTray: state.requestNeedsBikeTray,
  });
  const findRequest = vi.fn(() => Promise.resolve(currentRequest()));

  const selectChain = () => {
    const chain: any = {};
    let selectedTable: any;
    chain.from = vi.fn((value: any) => {
      selectedTable = value;
      return chain;
    });
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(
      selectedTable?.__name === "offers"
        ? [state.createdOffers.at(-1) ?? offer]
        : [currentRequest()],
    ));
    chain.then = (resolve: any, reject: any) => Promise.resolve(
      selectedTable?.__name === "claims" ? state.existingClaims : [],
    ).then(resolve, reject);
    return chain;
  };
  const insert = vi.fn((selectedTable: any) => ({
    values: vi.fn((values: any) => {
      if (selectedTable?.__name === "offers") state.createdOffers.push({ id: 81, ...values });
      if (selectedTable?.__name === "claims") state.insertedClaims.push(values);
      if (state.insertError && selectedTable?.__name === "claims") {
        const failingQuery: any = {
          returning: vi.fn().mockRejectedValue(state.insertError),
        };
        failingQuery.then = (resolve: any, reject: any) =>
          Promise.reject(state.insertError).then(resolve, reject);
        return failingQuery;
      }
      return {
        returning: vi.fn().mockResolvedValue([{
          id: selectedTable?.__name === "offers" ? 81 : 61,
          ...values,
        }]),
      };
    }),
  }));
  const transaction = vi.fn(async (callback: any) => {
    const createdOffersLength = state.createdOffers.length;
    const insertedClaimsLength = state.insertedClaims.length;
    const tx = {
      execute: state.capacityLock,
      select: vi.fn(selectChain),
      insert,
      update: vi.fn(() => {
        const chain: any = {};
        chain.set = vi.fn(() => chain);
        chain.where = vi.fn(() => chain);
        chain.returning = vi.fn().mockResolvedValue(
          state.matchTransitionRejected ? [] : [{ ...openRequest, status: "matched", matchedOfferId: OFFER_ID }],
        );
        return chain;
      }),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockImplementation(async () => {
            const request = currentRequest();
            state.deletedRequests.push(request);
            return [request];
          }),
        })),
      })),
    };
    try {
      return await callback(tx);
    } catch (error) {
      state.createdOffers.length = createdOffersLength;
      state.insertedClaims.length = insertedClaimsLength;
      throw error;
    }
  });

  return {
    db: {
      query: {
        usersTable: { findFirst: findUser },
        carpoolOffersTable: { findFirst: findOffer },
        carpoolRequestsTable: { findFirst: findRequest },
      },
      select: vi.fn(selectChain),
      insert,
      transaction,
    },
    usersTable,
    carpoolOffersTable,
    carpoolClaimsTable,
    carpoolRequestsTable,
    eventsTable,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = state.clerkUserId;
    next();
  },
}));
vi.mock("../lib/notifications", () => ({ createNotification: state.notification }));
vi.mock("../lib/email", () => ({ sendEmail: state.email }));
vi.mock("./settings", () => ({ getShortNamePrefix: vi.fn().mockResolvedValue("") }));
vi.mock("../lib/emailLinks", () => ({
  addEmailLinks: vi.fn((message: string) => ({ text: message, html: message })),
  createEmailLink: vi.fn(),
}));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn() } }));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: router } = await import("./carpools");
  const app = express();
  app.use(express.json());
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  state.clerkUserId = "rider-clerk";
  state.insertError = null;
  state.matchTransitionRejected = false;
  state.requestNeedsBikeTray = false;
  state.insertedClaims.length = 0;
  state.createdOffers.length = 0;
  state.deletedRequests.length = 0;
  state.existingClaims.length = 0;
  state.capacityLock.mockClear();
  state.notification.mockClear();
  state.email.mockClear();
});

describe("carpool claim duplicate protection", () => {
  it("copies the offer event onto a self-service claim", async () => {
    const response = await fetch(`${baseUrl}/carpools/${OFFER_ID}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needsSeat: true }),
    });

    expect(response.status).toBe(201);
    expect(state.insertedClaims).toContainEqual(expect.objectContaining({
      carpoolOfferId: OFFER_ID,
      eventId: EVENT_ID,
      riderUserId: RIDER_ID,
    }));
  });

  it("returns a useful conflict without emailing when the claim uniqueness constraint wins", async () => {
    state.insertError = Object.assign(new Error("duplicate key"), { code: "23505" });

    const response = await fetch(`${baseUrl}/carpools/${OFFER_ID}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already|claim|ride/i);
    expect(state.email).not.toHaveBeenCalled();
  });

  it("counts driver-matched claims and rejects a stale request when no seat remains", async () => {
    state.existingClaims.push({
      id: 70,
      needsSeat: true,
      needsBikeTray: false,
      matchedByDriver: true,
    }, {
      id: 71,
      needsSeat: true,
      needsBikeTray: false,
      matchedByDriver: false,
    });

    const response = await fetch(`${baseUrl}/carpools/${OFFER_ID}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needsSeat: true, needsBikeTray: false }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "NO_SEATS" });
    expect(state.insertedClaims).toHaveLength(0);
  });

  it("offers rider-only fallback when the seat remains but the bike tray is full", async () => {
    state.existingClaims.push({
      id: 72,
      needsSeat: true,
      needsBikeTray: true,
      matchedByDriver: true,
    });

    const response = await fetch(`${baseUrl}/carpools/${OFFER_ID}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needsSeat: true, needsBikeTray: true }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "NO_BIKE_TRAYS",
      riderOnlyAvailable: true,
    });
    expect(state.insertedClaims).toHaveLength(0);
  });
});

describe("carpool request match races", () => {
  it("creates an event-scoped claim when atomically matching an open request", async () => {
    state.clerkUserId = "driver-clerk";
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerId: OFFER_ID }),
    });

    expect(response.status).toBe(200);
    expect(state.insertedClaims).toContainEqual(expect.objectContaining({
      carpoolOfferId: OFFER_ID,
      eventId: EVENT_ID,
      riderUserId: RIDER_ID,
    }));
    expect(state.capacityLock).toHaveBeenCalledTimes(2);
  });

  it("atomically creates an offer when the driver has none", async () => {
    state.clerkUserId = "driver-clerk";
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(state.createdOffers).toContainEqual(expect.objectContaining({
      eventId: EVENT_ID,
      driverUserId: DRIVER_ID,
    }));
    expect(state.insertedClaims).toContainEqual(expect.objectContaining({
      carpoolOfferId: 81,
      riderUserId: RIDER_ID,
    }));
  });

  it("rolls back an auto-created offer when inserting the claim fails", async () => {
    state.clerkUserId = "driver-clerk";
    state.insertError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
    expect(state.createdOffers).toHaveLength(0);
    expect(state.insertedClaims).toHaveLength(0);
    expect(state.notification).not.toHaveBeenCalled();
  });

  it("does not invent a bike tray when auto-creating an offer", async () => {
    state.clerkUserId = "driver-clerk";
    state.requestNeedsBikeTray = true;
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "NO_BIKE_TRAYS",
      riderOnlyAvailable: true,
    });
    expect(state.createdOffers).toHaveLength(0);
    expect(state.insertedClaims).toHaveLength(0);
  });

  it("forbids students from matching or auto-creating driving offers", async () => {
    state.clerkUserId = "rider-clerk";
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(state.createdOffers).toHaveLength(0);
  });

  it("rejects bypassing matching through the generic request edit endpoint", async () => {
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "matched", matchedOfferId: OFFER_ID }),
    });

    expect(response.status).toBe(409);
    expect(state.insertedClaims).toHaveLength(0);
  });

  it("rejects setting matchedOfferId without a status transition", async () => {
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchedOfferId: OFFER_ID }),
    });

    expect(response.status).toBe(409);
    expect(state.insertedClaims).toHaveLength(0);
  });

  it("locks an open request before deleting it", async () => {
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(state.capacityLock).toHaveBeenCalledOnce();
    expect(state.deletedRequests).toHaveLength(1);
  });

  it("returns conflict and does not notify when its conditional open-to-matched transition loses", async () => {
    state.clerkUserId = "driver-clerk";
    state.matchTransitionRejected = true;
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerId: OFFER_ID }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already|open|match/i);
    expect(state.notification).not.toHaveBeenCalled();
  });

  it("returns conflict and does not notify if inserting the matched claim races", async () => {
    state.clerkUserId = "driver-clerk";
    state.insertError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const response = await fetch(`${baseUrl}/carpool-requests/${openRequest.id}/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerId: OFFER_ID }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already|claim|ride/i);
    expect(state.notification).not.toHaveBeenCalled();
  });
});

describe("carpool claim event/rider invariant", () => {
  it("declares the event+rider unique index in both schema and migration", () => {
    const schema = readFileSync(
      new URL("../../../../lib/db/src/schema/carpools.ts", import.meta.url),
      "utf8",
    );
    const migration = readFileSync(new URL("../lib/migrate.ts", import.meta.url), "utf8");

    expect(schema).toMatch(
      /uniqueIndex\("carpool_claims_event_rider_unique_idx"\)\.on\(t\.eventId, t\.riderUserId\)/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS carpool_claims_event_rider_unique_idx\s+ON carpool_claims\(event_id, rider_user_id\)/,
    );
  });

  it("backfills event ids and deterministically retains a matched-request claim before the oldest duplicate", () => {
    const migration = readFileSync(new URL("../lib/migrate.ts", import.meta.url), "utf8");

    expect(migration).toMatch(
      /SET event_id = offer\.event_id[\s\S]*claim\.carpool_offer_id = offer\.id/,
    );
    expect(migration).toMatch(
      /PARTITION BY claim\.event_id, claim\.rider_user_id[\s\S]*CASE WHEN matched_request\.id IS NOT NULL THEN 0 ELSE 1 END,[\s\S]*claim\.created_at,[\s\S]*claim\.id/,
    );
  });
});