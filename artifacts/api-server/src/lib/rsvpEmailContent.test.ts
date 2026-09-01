import { describe, expect, it } from "vitest";
import {
  buildRsvpConfirmationContent,
  shouldQueueRsvpConfirmation,
} from "./rsvpEmailContent";

describe("RSVP confirmation batching rules", () => {
  it("queues a confirmation only when an RSVP becomes attending", () => {
    expect(shouldQueueRsvpConfirmation(null, "attending")).toBe(true);
    expect(shouldQueueRsvpConfirmation("maybe", "attending")).toBe(true);
    expect(shouldQueueRsvpConfirmation("not_attending", "attending")).toBe(true);
    expect(shouldQueueRsvpConfirmation("attending", "attending")).toBe(false);
    expect(shouldQueueRsvpConfirmation("attending", "maybe")).toBe(false);
    expect(shouldQueueRsvpConfirmation("attending", "not_attending")).toBe(false);
  });

  it("renders one event block with every currently attending family member", () => {
    const content = buildRsvpConfirmationContent(
      "Noah",
      {
        title: "Evergreen Dig Day (Loop Loop - Goldilocks)",
        startTime: new Date("2030-09-05T16:00:00Z"),
        location: "Loop Loop Trails",
      },
      [
        { firstName: "Noah", lastName: "Smith" },
        { firstName: "Riley", lastName: "Smith" },
        { firstName: "Casey", lastName: "Smith" },
      ],
    );

    expect(content.subject).toBe("You're set for Evergreen Dig Day (Loop Loop - Goldilocks)");
    expect(content.text).toContain("You're confirmed for your family:");
    expect(content.text).toContain("  Noah Smith");
    expect(content.text).toContain("  Riley Smith");
    expect(content.text).toContain("  Casey Smith");
    expect(content.text.match(/Event: Evergreen Dig Day/g)).toHaveLength(1);
    expect(content.text.match(/Where: Loop Loop Trails/g)).toHaveLength(1);
  });

  it("uses the latest RSVP snapshot, so canceled family members are not rendered", () => {
    const content = buildRsvpConfirmationContent(
      "Noah",
      {
        title: "Volunteer Practice",
        startTime: new Date("2030-09-05T16:00:00Z"),
        location: "Trailhead",
      },
      [{ firstName: "Noah", lastName: "Smith" }],
    );

    expect(content.text).toContain("Noah Smith");
    expect(content.text).not.toContain("Riley Smith");
  });
});