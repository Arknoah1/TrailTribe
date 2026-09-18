import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  offers: [] as Array<{ driverUserId: number }>,
  users: new Map<number, Record<string, any>>(),
  event: { id: 91, title: "WSCL Race - Gig Harbor" } as Record<string, any> | undefined,
  createNotification: vi.fn(),
  sendEmail: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const usersTable = { id: "users.id" };
  const eventsTable = { id: "events.id" };
  const carpoolOffersTable = {
    driverUserId: "offers.driverUserId",
    eventId: "offers.eventId",
  };

  return {
    usersTable,
    eventsTable,
    carpoolOffersTable,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockImplementation(() => Promise.resolve(mocks.offers)),
        })),
      })),
      query: {
        usersTable: {
          findFirst: vi.fn(({ where }: { where: { value: number } }) =>
            Promise.resolve(mocks.users.get(where.value)),
          ),
        },
        eventsTable: {
          findFirst: vi.fn(() => Promise.resolve(mocks.event)),
        },
      },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column, value) => ({ column, value })),
}));

vi.mock("./notifications", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("./email", () => ({
  sendEmail: mocks.sendEmail,
  isDeliverableEmailAddress: (email: string | null | undefined) => Boolean(
    email
    && !email.endsWith("@trailteam.internal")
    && !email.endsWith("@pending.trailteam.app"),
  ),
}));

vi.mock("./emailLinks", () => ({
  createEmailLink: (path: string, label: string) => ({ path, label }),
  addNotificationEmailLinks: (text: string, links: Array<{ path: string; label: string }>) => ({
    text: `${text}\n\n${links.map((link) => `${link.label}: ${link.path}`).join("\n")}`,
  }),
}));

vi.mock("./logger", () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock("../routes/settings", () => ({
  getShortNamePrefix: vi.fn().mockResolvedValue("[TrailTeam] "),
}));

import { notifyDriversOfCarpoolRequest } from "./carpoolRequestNotifications";

const requester = {
  id: 10,
  firstName: "Greer",
  lastName: "Maier",
};

function driver(
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    firstName: `Driver${id}`,
    lastName: "Family",
    email: `driver${id}@example.test`,
    notificationsEnabled: true,
    emailNotifications: true,
    notificationPreferences: { carpoolUpdates: true },
    ...overrides,
  };
}

describe("ride request driver notifications", () => {
  beforeEach(() => {
    mocks.offers = [];
    mocks.users.clear();
    mocks.users.set(20, {
      id: 20,
      firstName: "Bryce",
      lastName: "Maier",
    });
    mocks.event = { id: 91, title: "WSCL Race - Gig Harbor" };
    mocks.createNotification.mockReset().mockResolvedValue(undefined);
    mocks.sendEmail.mockReset().mockResolvedValue({ status: "sent" });
    mocks.loggerError.mockReset();
  });

  it("emails each other driver once and preserves the in-app alert", async () => {
    mocks.offers = [
      { driverUserId: 31 },
      { driverUserId: 31 },
      { driverUserId: 32 },
      { driverUserId: requester.id },
    ];
    mocks.users.set(31, driver(31));
    mocks.users.set(32, driver(32));

    await notifyDriversOfCarpoolRequest({
      eventId: 91,
      riderId: 20,
      requester,
    });

    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      31,
      "carpool_request_posted",
      "New Ride Request",
      "Greer Maier posted a ride request for this event.",
      "/carpools/91",
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "driver31@example.test",
      subject: "[TrailTeam] New ride request for WSCL Race - Gig Harbor",
      text: expect.stringContaining("Bryce Maier needs a ride to WSCL Race - Gig Harbor"),
    }));
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain(
      "View carpool board: /carpools/91",
    );
  });

  it("respects email and Carpool updates opt-outs without suppressing in-app alerts", async () => {
    mocks.offers = [40, 41, 42, 43, 44, 45].map((driverUserId) => ({ driverUserId }));
    mocks.users.set(40, driver(40, { notificationsEnabled: false }));
    mocks.users.set(41, driver(41, { emailNotifications: false }));
    mocks.users.set(42, driver(42, {
      notificationPreferences: { carpoolUpdates: false },
    }));
    mocks.users.set(43, driver(43, { email: "driver43@trailteam.internal" }));
    mocks.users.set(44, driver(44, { email: null }));
    mocks.users.set(45, driver(45));

    await notifyDriversOfCarpoolRequest({
      eventId: 91,
      riderId: 20,
      requester,
    });

    // createNotification applies the same notificationsEnabled master switch
    // before persisting; the helper still invokes it for every recipient.
    expect(mocks.createNotification).toHaveBeenCalledTimes(6);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "driver45@example.test",
    }));
  });

  it("continues alerting other drivers when one email throws", async () => {
    mocks.offers = [{ driverUserId: 51 }, { driverUserId: 52 }];
    mocks.users.set(51, driver(51));
    mocks.users.set(52, driver(52));
    mocks.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === "driver51@example.test") throw new Error("SMTP unavailable");
      return { status: "sent" };
    });

    await expect(notifyDriversOfCarpoolRequest({
      eventId: 91,
      riderId: 20,
      requester,
    })).resolves.toBeUndefined();

    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: 51, eventId: 91 }),
      "[carpools] ride request email error",
    );
  });
});