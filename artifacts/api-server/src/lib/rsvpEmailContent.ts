export interface RsvpEmailEvent {
  title: string;
  startTime: Date;
  location: string;
}

export interface RsvpEmailAttendee {
  firstName: string;
  lastName: string;
}

export function shouldQueueRsvpConfirmation(
  previousStatus: string | null | undefined,
  nextStatus: string,
): boolean {
  return nextStatus === "attending" && previousStatus !== "attending";
}

export function formatRsvpEventTime(startTime: Date): string {
  return startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function buildRsvpConfirmationContent(
  recipientFirstName: string,
  event: RsvpEmailEvent,
  attendees: RsvpEmailAttendee[],
): { subject: string; text: string } {
  const attendeeLines = attendees.map((attendee) => {
    const name = `${attendee.firstName} ${attendee.lastName}`.trim();
    return `  ${name || "Family member"}`;
  });

  return {
    subject: `You're set for ${event.title}`,
    text: [
      `Hi ${recipientFirstName},`,
      ``,
      `You're confirmed for your family:`,
      ...attendeeLines,
      ``,
      `Event: ${event.title}`,
      `When: ${formatRsvpEventTime(event.startTime)}`,
      `Where: ${event.location}`,
      ``,
      `See you on the trail!`,
      `— TrailTeam`,
    ].join("\n"),
  };
}