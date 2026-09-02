import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ getAppBase: () => "https://trailteam.app" }));

import { addEmailLinks, buildAppUrl, createEmailLink } from "./emailLinks";

describe("email links", () => {
  it("builds absolute URLs for supported internal destinations", () => {
    expect(buildAppUrl("/events/42")).toBe("https://trailteam.app/events/42");
    expect(buildAppUrl("/events/42?focus=volunteer")).toBe(
      "https://trailteam.app/events/42?focus=volunteer",
    );
    expect(buildAppUrl("/messages/thread/7?tab=events")).toBe(
      "https://trailteam.app/messages/thread/7?tab=events",
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
});