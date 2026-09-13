export type CalendarEventTiming = {
  startTime: string;
  endTime?: string | null;
};

export function isCalendarEventCompleted(event: CalendarEventTiming, now = new Date()): boolean {
  const completionTime = event.endTime ?? event.startTime;
  return new Date(completionTime).getTime() <= now.getTime();
}