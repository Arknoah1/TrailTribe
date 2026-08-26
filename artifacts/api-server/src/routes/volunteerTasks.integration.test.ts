import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, count, inArray } from "drizzle-orm";
import {
  db,
  eventTaskSignupsTable,
  eventTasksTable,
  eventsTable,
  householdsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-clerk-user-id");
    next();
  },
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-clerk-user-id");
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  requireCoachOrAdmin: (_req: any, _res: any, next: any) => next(),
}));

describe("volunteer signup capacity with PostgreSQL row locking", () => {
  let server: Server;
  let baseUrl: string;
  let eventId: number;
  let taskId: number;
  let bulkTaskId: number;
  let onboardingClerkUserId: string;
  let householdId: number;
  let userIds: number[] = [];

  beforeAll(async () => {
    const [{ default: volunteerTasksRouter }, [existingUsers, firstUsers, secondUsers]] =
      await Promise.all([
        import("./volunteerTasks"),
        Promise.all([
          db.insert(usersTable).values({
            firstName: "Existing",
            lastName: "Volunteer",
            email: `volunteer-existing-${process.pid}-${Date.now()}@example.test`,
            clerkUserId: `volunteer-existing-${process.pid}-${Date.now()}`,
            approved: true,
          }).returning(),
          db.insert(usersTable).values({
            firstName: "Concurrent",
            lastName: "Volunteer One",
            email: `volunteer-one-${process.pid}-${Date.now()}@example.test`,
            clerkUserId: `volunteer-one-${process.pid}-${Date.now()}`,
            approved: true,
          }).returning(),
          db.insert(usersTable).values({
            firstName: "Concurrent",
            lastName: "Volunteer Two",
            email: `volunteer-two-${process.pid}-${Date.now()}@example.test`,
            clerkUserId: `volunteer-two-${process.pid}-${Date.now()}`,
            approved: true,
          }).returning(),
        ]),
      ]);
    const existingUser = existingUsers[0];
    const firstUser = firstUsers[0];
    const secondUser = secondUsers[0];

    userIds = [existingUser.id, firstUser.id, secondUser.id];
    const [household] = await db.insert(householdsTable).values({
      name: "Onboarding test family",
      inviteCode: `onboarding-family-${process.pid}-${Date.now()}`,
    }).returning();
    householdId = household.id;
    onboardingClerkUserId = `onboarding-volunteer-${process.pid}-${Date.now()}`;
    const [onboardingUser] = await db.insert(usersTable).values({
      firstName: "Onboarding",
      lastName: "Volunteer",
      email: `${onboardingClerkUserId}@example.test`,
      clerkUserId: onboardingClerkUserId,
      householdId,
      approved: false,
    }).returning();
    userIds.push(onboardingUser.id);

    const [event] = await db.insert(eventsTable).values({
      title: "Concurrent volunteer signup test",
      eventType: "volunteer",
      startTime: new Date("2030-01-01T10:00:00Z"),
      iCalUid: `volunteer-concurrency-${process.pid}-${Date.now()}`,
      createdByUserId: existingUser.id,
      volunteerTasksEnabled: true,
    }).returning();
    eventId = event.id;

    const [task] = await db.insert(eventTasksTable).values({
      eventId,
      category: "Test",
      title: "Final slot",
      slotsNeeded: 2,
    }).returning();
    taskId = task.id;

    await db.insert(eventTaskSignupsTable).values({
      eventTaskId: taskId,
      eventId,
      userId: existingUser.id,
    });

    const [bulkTask] = await db.insert(eventTasksTable).values({
      eventId,
      category: "Test",
      title: "Bulk final slot",
      slotsNeeded: 2,
    }).returning();
    bulkTaskId = bulkTask.id;

    await db.insert(eventTaskSignupsTable).values({
      eventTaskId: bulkTaskId,
      eventId,
      userId: existingUser.id,
    });

    const app = express();
    app.use(express.json());
    app.use("/", volunteerTasksRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    }
    if (userIds.length > 0) {
      await db.delete(usersTable).where(
        userIds.length === 1
          ? eq(usersTable.id, userIds[0])
          : and(...userIds.map((id) => eq(usersTable.id, id))),
      );
    }
    if (householdId) {
      await db.delete(householdsTable).where(eq(householdsTable.id, householdId));
    }
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("allows exactly one concurrent request to claim the final slot", async () => {
    const signup = (clerkUserId: string) => {
      return fetch(`${baseUrl}/events/${eventId}/tasks/${taskId}/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-clerk-user-id": clerkUserId,
        },
        body: JSON.stringify({}),
      });
    };

    const [firstUser, secondUser] = await db
      .select({ clerkUserId: usersTable.clerkUserId })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds.slice(1)));
    const responses = await Promise.all([
      signup(firstUser.clerkUserId!),
      signup(secondUser.clerkUserId!),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect((await responses.find((response) => response.status === 409)!.json()).error)
      .toBe("Task is at capacity");

    const [{ signupCount }] = await db
      .select({ signupCount: count() })
      .from(eventTaskSignupsTable)
      .where(eq(eventTaskSignupsTable.eventTaskId, taskId));
    expect(Number(signupCount)).toBeLessThanOrEqual(2);
    expect(Number(signupCount)).toBe(2);
  });

  it("does not overbook the final slot across concurrent bulk requests", async () => {
    const bulkSignup = (clerkUserId: string) => {
      return fetch(`${baseUrl}/events/${eventId}/tasks/bulk-signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-clerk-user-id": clerkUserId,
        },
        body: JSON.stringify({ taskIds: [bulkTaskId] }),
      });
    };

    const [firstUser, secondUser] = await db
      .select({ clerkUserId: usersTable.clerkUserId })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds.slice(1)));
    const responses = await Promise.all([
      bulkSignup(firstUser.clerkUserId!),
      bulkSignup(secondUser.clerkUserId!),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect(bodies.sort((a, b) => a.added - b.added)).toEqual([
      { added: 0, skipped: 1 },
      { added: 1, skipped: 0 },
    ]);

    const [{ signupCount }] = await db
      .select({ signupCount: count() })
      .from(eventTaskSignupsTable)
      .where(eq(eventTaskSignupsTable.eventTaskId, bulkTaskId));
    expect(Number(signupCount)).toBeLessThanOrEqual(2);
    expect(Number(signupCount)).toBe(2);
  });

  it("gives pending households a volunteer view without other volunteers' details", async () => {
    const response = await fetch(`${baseUrl}/onboarding/volunteer-opportunities`, {
      headers: { "x-test-clerk-user-id": onboardingClerkUserId },
    });

    expect(response.status).toBe(200);
    const opportunities = await response.json();
    const opportunity = opportunities.find((item: any) => item.id === eventId);
    const task = opportunity.tasks.find((item: any) => item.id === taskId);

    expect(opportunity).toMatchObject({
      id: eventId,
      title: "Concurrent volunteer signup test",
    });
    expect(task).toMatchObject({
      id: taskId,
      title: "Final slot",
      mySignup: false,
    });
    expect(task.signupCount).toBeGreaterThan(0);
    expect(task).not.toHaveProperty("signups");
    expect(JSON.stringify(task)).not.toContain("Existing Volunteer");
  });
});
