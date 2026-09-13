import { describe, expect, it } from "vitest";
import {
  buildEventChangeMessage,
  buildSeriesRescheduleMessage,
  getEventChangeDeliveryChannels,
  getMaterialEventChanges,
} from "./eventChangeNotifications";

const event = {
  id: 1,
  title: "Tuesday Ride",
  description: "Bring water",
  eventType: "practice",
  startTime: new Date("2026-09-16T01:00:00.000Z"),
  endTime: new Date("2026-09-16T03:00:00.000Z"),
  trailheadId: 1,
  locationOverride: null,
  googleMapsUrlOverride: null,
  podIds: ["green"],
  isAllTeam: false,
  rsvpDeadline: null,
  volunteerSlotsNeeded: 0,
  volunteerTasksEnabled: false,
  createdByUserId: 1,
  iCalUid: "uid",
  seriesId: null,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const user = {
  isActive: true,
  approved: true,
  role: "parent",
  seasonParticipationStatus: "active",
  notificationsEnabled: true,
  pushNotifications: true,
  emailNotifications: true,
  email: "parent@example.com",
  notificationPreferences: { eventReminders: true },
} as any;

describe("event change summaries", () => {
  it("describes every material event field with old and new values", () => {
    const changes = getMaterialEventChanges(event, {
      ...event,
      title: "Wednesday Ride",
      startTime: new Date("2026-09-17T01:30:00.000Z"),
      endTime: null,
      trailheadId: 2,
      locationOverride: "North parking lot",
      googleMapsUrlOverride: "https://maps.example/new",
      podIds: null,
      isAllTeam: true,
    }, {
      beforeTrailhead: "Old Trail",
      afterTrailhead: "New Trail",
    });

    expect(changes.map((change) => change.label)).toEqual([
      "Title",
      "Starts",
      "Ends",
      "Trailhead",
      "Location",
      "Map destination",
      "Audience",
    ]);
    expect(changes.find((change) => change.label === "Trailhead")).toEqual({
      label: "Trailhead",
      before: "Old Trail",
      after: "New Trail",
    });
  });

  it("ignores description, type, RSVP, volunteer, and administrative changes", () => {
    expect(getMaterialEventChanges(event, {
      ...event,
      description: "Different notes",
      eventType: "social",
      rsvpDeadline: new Date(),
      volunteerSlotsNeeded: 4,
      isArchived: true,
      seriesId: "series",
    })).toEqual([]);
  });

  it("does not expose a renamed event title to a removed audience", () => {
    const message = buildEventChangeMessage(
      event,
      { ...event, title: "Private New Name", podIds: ["blue"] },
      [{ label: "Title", before: event.title, after: "Private New Name" }],
      true,
      false,
    );
    expect(message.title).toBe("Event assignment changed");
    expect(`${message.title}\n${message.body}`).not.toContain("Private New Name");
    expect(message.link).toBe("/calendar");
  });

  it("builds a chronological series summary from only the recipient's events", () => {
    const blueEvent = {
      ...event,
      id: 2,
      title: "Blue Pod Private Ride",
      podIds: ["blue"],
      startTime: new Date("2026-09-15T01:00:00.000Z"),
    };
    const greenAfter = { ...event, startTime: new Date("2026-09-17T01:00:00.000Z") };
    const blueAfter = { ...blueEvent, startTime: new Date("2026-09-16T01:00:00.000Z") };
    const message = buildSeriesRescheduleMessage(
      [blueEvent, event],
      [blueAfter, greenAfter],
      1,
      { role: "parent", podId: "green" },
    );
    expect(message?.body).toContain("1 upcoming event was moved 1 day later");
    expect(message?.body).toContain("First event: Tuesday Ride");
    expect(message?.body).not.toContain("Blue Pod Private Ride");
  });
});

describe("event change delivery preferences", () => {
  it("allows each enabled channel independently", () => {
    expect(getEventChangeDeliveryChannels(user)).toEqual({ inApp: true, email: true });
    expect(getEventChangeDeliveryChannels({ ...user, emailNotifications: false })).toEqual({
      inApp: true,
      email: false,
    });
    expect(getEventChangeDeliveryChannels({ ...user, pushNotifications: false })).toEqual({
      inApp: false,
      email: true,
    });
  });

  it("honors the master switch, topic opt-out, approval, and active-season rules", () => {
    expect(getEventChangeDeliveryChannels({ ...user, notificationsEnabled: false })).toEqual({ inApp: false, email: false });
    expect(getEventChangeDeliveryChannels({ ...user, notificationPreferences: { eventReminders: false } })).toEqual({ inApp: false, email: false });
    expect(getEventChangeDeliveryChannels({ ...user, approved: false })).toEqual({ inApp: false, email: false });
    expect(getEventChangeDeliveryChannels({ ...user, role: "student", seasonParticipationStatus: "season_off" })).toEqual({ inApp: false, email: false });
  });
});