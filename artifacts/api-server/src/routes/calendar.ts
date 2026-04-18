import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, eventsTable, trailheadsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { randomUUID } from "crypto";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

function fmtICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICalText(val: string): string {
  return val
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldICalLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    const end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    chunks.push((start === 0 ? "" : " ") + bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return chunks.join("\r\n");
}

router.get("/calendar/subscribe-url", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.approved) {
    res.status(403).json({ error: "Account not yet approved" });
    return;
  }

  if (!user.calendarToken) {
    const token = randomUUID();
    [user] = await db
      .update(usersTable)
      .set({ calendarToken: token })
      .where(eq(usersTable.id, user.id))
      .returning();
  }

  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost";

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const httpsUrl = `${protocol}://${host}/api/calendar/${user.calendarToken}/team.ics`;
  const subscribeUrl = `webcal://${host}/api/calendar/${user.calendarToken}/team.ics`;

  res.json({ subscribeUrl, httpsUrl });
});

router.get("/calendar/:token/team.ics", async (req, res) => {
  const token = str(req.params.token);
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.calendarToken, token),
  });

  if (!user) {
    res.status(404).send("Not found");
    return;
  }

  const events = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.isArchived, false))
    .orderBy(asc(eventsTable.startTime));

  const trailheadIds = [...new Set(events.map(e => e.trailheadId).filter(Boolean))];
  const trailheads: Record<number, typeof trailheadsTable.$inferSelect> = {};
  if (trailheadIds.length > 0) {
    const rows = await db.select().from(trailheadsTable);
    rows.forEach(t => { trailheads[t.id] = t; });
  }

  const now = fmtICalDate(new Date());

  const vevents = events.map(event => {
    const dtstart = fmtICalDate(new Date(event.startTime));
    const dtend = event.endTime
      ? fmtICalDate(new Date(event.endTime))
      : fmtICalDate(new Date(new Date(event.startTime).getTime() + 3600000));

    const trailhead = event.trailheadId ? trailheads[event.trailheadId] : null;
    const locationParts: string[] = [];
    if (trailhead) {
      locationParts.push(trailhead.name);
      if (trailhead.address) locationParts.push(trailhead.address);
    } else if (event.locationOverride) {
      locationParts.push(event.locationOverride);
    }
    const location = locationParts.join(", ");

    const descParts: string[] = [
      `Type: ${event.eventType}`,
    ];
    if (event.description) descParts.push(event.description);

    const lines = [
      "BEGIN:VEVENT",
      foldICalLine(`UID:${event.iCalUid}@trailtribe`),
      foldICalLine(`DTSTAMP:${now}`),
      foldICalLine(`DTSTART:${dtstart}`),
      foldICalLine(`DTEND:${dtend}`),
      foldICalLine(`LAST-MODIFIED:${fmtICalDate(new Date(event.updatedAt))}`),
      foldICalLine(`SUMMARY:${escapeICalText(event.title)}`),
      foldICalLine(`DESCRIPTION:${escapeICalText(descParts.join("\\n"))}`),
    ];

    if (location) {
      lines.push(foldICalLine(`LOCATION:${escapeICalText(location)}`));
    }

    lines.push("END:VEVENT");
    return lines.join("\r\n");
  });

  const calLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TrailTribe//Team Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TrailTribe Team Calendar",
    "X-WR-CALDESC:Your mountain bike team schedule",
    "X-WR-TIMEZONE:UTC",
    ...vevents,
    "END:VCALENDAR",
  ];

  const body = calLines.join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="trailtribe-team.ics"');
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(body);
});

export default router;
