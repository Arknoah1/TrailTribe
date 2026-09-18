import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ getAppBase: () => "https://trailteam.app" }));

import {
  addEmailLinks,
  addNotificationEmailLinks,
  buildAppUrl,
  createEmailLink,
} from "./emailLinks";

describe("email links", () => {
  it("builds absolute URLs for supported internal destinations", () => {
    expect(buildAppUrl("/events/42")).toBe("https://trailteam.app/events/42");
    expect(buildAppUrl("/events/42?focus=volunteer")).toBe(
      "https://trailteam.app/events/42?focus=volunteer",
    );
    expect(buildAppUrl("/messages/thread/7?tab=events")).toBe(
      "https://trailteam.app/messages/thread/7?tab=events",
    );
    expect(buildAppUrl("/profile?tab=notifications")).toBe(
      "https://trailteam.app/profile?tab=notifications",
    );
  });

  it("rejects unsupported and external destinations", () => {
    expect(buildAppUrl("/settings")).toBeNull();
    expect(buildAppUrl("https://example.com")).toBeNull();
    expect(buildAppUrl("//example.com")).toBeNull();
    expect(createEmailLink("/events/42", "View event")).toEqual({
      href: "https://trailteam.app/events/42",
      label: "View event",
    });
  });

  it("renders escaped HTML and a plain-text URL fallback", () => {
    const result = addEmailLinks("Hello <family>\n\nRead this message.", [
      { label: "View event", href: "https://trailteam.app/events/42" },
    ]);

    expect(result.text).toContain("View event: https://trailteam.app/events/42");
    expect(result.html).toContain("Hello &lt;family&gt;");
    expect(result.html).toContain('href="https://trailteam.app/events/42"');
    expect(result.html).toContain(">View event</a>");
  });

  it("adds one notification-settings footer to text and HTML", () => {
    const result = addNotificationEmailLinks("Hello <family>", [
      { label: "View event", href: "https://trailteam.app/events/42" },
      {
        label: "Existing settings link",
        href: "https://trailteam.app/profile?tab=notifications",
      },
    ]);

    expect(result.text).toContain(
      "To update your notification preferences, update your notification settings in the TrailTeam app.",
    );
    expect(result.text).toContain(
      "Update notification settings: https://trailteam.app/profile?tab=notifications",
    );
    expect(result.text?.match(/profile\?tab=notifications/g)).toHaveLength(1);
    expect(result.html).toContain("Hello &lt;family&gt;");
    expect(result.html).toContain(
      'href="https://trailteam.app/profile?tab=notifications"',
    );
    expect(result.html?.match(/profile\?tab=notifications/g)).toHaveLength(1);
  });
});