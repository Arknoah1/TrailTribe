import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recipient: {
    id: 7,
    notificationsEnabled: true,
    pushNotifications: true,
  } as { id: number; notificationsEnabled: boolean; pushNotifications: boolean },
  findRecipient: vi.fn(),
  insertValues: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    query: {
      usersTable: {
        findFirst: mocks.findRecipient,
      },
    },
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
  notificationsTable: { id: "notifications.id" },
  usersTable: { id: "users.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock("./push", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("./email", () => ({ sendEmail: vi.fn() }));
vi.mock("./emailLinks", () => ({
  addNotificationEmailLinks: vi.fn(),
  createEmailLink: vi.fn(),
}));
vi.mock("../routes/settings", () => ({ getShortNamePrefix: vi.fn() }));

const { createNotification } = await import("./notifications");

describe("createNotification channel preferences", () => {
  beforeEach(() => {
    mocks.recipient = {
      id: 7,
      notificationsEnabled: true,
      pushNotifications: true,
    };
    mocks.findRecipient.mockReset().mockImplementation(async () => mocks.recipient);
    mocks.insertValues.mockReset().mockResolvedValue(undefined);
    mocks.sendPushNotification.mockReset().mockResolvedValue({ status: "sent", successCount: 1, failureCount: 0 });
  });

  it("creates an in-app notification and sends push when both are enabled", async () => {
    await createNotification(7, "boardReplies", "New discussion", "A discussion started", "/messages/thread/10");

    expect(mocks.insertValues).toHaveBeenCalledWith({
      recipientUserId: 7,
      type: "boardReplies",
      title: "New discussion",
      body: "A discussion started",
      link: "/messages/thread/10",
      isRead: false,
    });
    expect(mocks.sendPushNotification).toHaveBeenCalledWith({
      userId: 7,
      title: "New discussion",
      body: "A discussion started",
      link: "/messages/thread/10",
    });
  });

  it("sends neither in-app nor push when global notifications are disabled", async () => {
    mocks.recipient.notificationsEnabled = false;

    await createNotification(7, "boardReplies", "New discussion", "A discussion started");

    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it("keeps in-app delivery enabled when device push is disabled", async () => {
    mocks.recipient.pushNotifications = false;

    await createNotification(7, "boardReplies", "New discussion", "A discussion started");

    expect(mocks.insertValues).toHaveBeenCalledOnce();
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });
});
