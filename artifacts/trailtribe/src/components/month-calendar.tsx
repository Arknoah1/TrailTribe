import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
  isToday,
  format,
  parseISO,
} from "date-fns";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const INK = "#0a0c10";

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  practice: { bg: "bg-primary", text: "text-primary-foreground", dot: "bg-primary" },
  race:     { bg: "bg-accent",  text: "text-accent-foreground",  dot: "bg-accent" },
  social:   { bg: "bg-secondary border border-primary/40", text: "text-primary", dot: "bg-primary/60" },
  volunteer:{ bg: "bg-accent/20 border border-accent/40", text: "text-accent", dot: "bg-accent/70" },
  other:    { bg: "bg-secondary", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Event {
  id: number;
  title: string;
  startTime: string;
  eventType: string;
}

interface MonthCalendarProps {
  events: Event[];
  month: Date;
  onMonthChange: (date: Date) => void;
  /** Coach/admin only: fires when the user clicks empty space or the day number in a cell */
  onDayClick?: (date: Date) => void;
}

export function MonthCalendar({ events, month, onMonthChange, onDayClick }: MonthCalendarProps) {
  const [, navigate] = useLocation();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const event of events) {
      const key = format(parseISO(event.startTime), "yyyy-MM-dd");
      const existing = map.get(key) ?? [];
      existing.push(event);
      map.set(key, existing);
    }
    return map;
  }, [events]);

  const expandedDayEvents = expandedDay ? (eventsByDay.get(expandedDay) ?? []) : [];
  const expandedDayLabel = expandedDay
    ? format(parseISO(expandedDay + "T00:00:00"), "EEEE, MMMM d")
    : "";

  const goPrev = () => onMonthChange(addMonths(startOfMonth(month), -1));
  const goNext = () => onMonthChange(addMonths(startOfMonth(month), 1));
  const goToday = () => onMonthChange(startOfMonth(new Date()));

  return (
    <>
      {/* Calendar container */}
      <div
        className="rounded-xl bg-card overflow-hidden"
        style={{ border: `2px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}
      >
        {/* Month nav header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-secondary"
          style={{ borderBottom: `2px solid ${INK}` }}
        >
          <button
            onClick={goPrev}
            className="p-1.5 rounded-md cel-interactive transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl tracking-wider leading-none">
              {format(month, "MMMM yyyy")}
            </h2>
            <button
              onClick={goToday}
              className="text-xs px-3 py-1.5 rounded-lg border-2 font-bold uppercase tracking-wide hover:bg-muted transition-colors cel-interactive"
              style={{ borderColor: INK }}
            >
              Today
            </button>
          </div>

          <button
            onClick={goNext}
            className="p-1.5 rounded-md cel-interactive transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* DOW header row */}
        <div className="grid grid-cols-7" style={{ borderBottom: `2px solid ${INK}` }}>
          {DOW_LABELS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);
            const showEvents = dayEvents.slice(0, 2);
            const overflow = dayEvents.length - showEvents.length;
            const isLastRow = idx >= days.length - 7;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[5rem] p-1",
                  !inMonth && "bg-secondary/40",
                  today && "bg-primary/5",
                  onDayClick && "cursor-pointer hover:bg-primary/10 transition-colors"
                )}
                style={{
                  borderBottom: !isLastRow ? `1px solid ${INK}` : undefined,
                  borderRight: idx % 7 !== 6 ? `1px solid ${INK}` : undefined,
                }}
                onClick={() => onDayClick?.(day)}
                title={onDayClick ? `Add event on ${format(day, "MMM d")}` : undefined}
              >
                {/* Day number + amber has-events dot */}
                <div className="flex flex-col items-center mb-1">
                  <div className={cn(
                    "text-xs font-bold w-6 h-6 flex items-center justify-center",
                    today
                      ? "rounded-sm border-2 bg-accent text-accent-foreground"
                      : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                  )}
                  style={today ? { borderColor: INK } : undefined}
                  >
                    {format(day, "d")}
                  </div>
                  {/* Amber dot — only shown when events overflow the visible limit */}
                  {overflow > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shrink-0" style={{ border: `1px solid ${INK}` }} />
                  )}
                </div>

                {/* Event pills */}
                <div className="space-y-0.5">
                  {showEvents.map((event) => {
                    const colors = EVENT_TYPE_COLORS[event.eventType] ?? EVENT_TYPE_COLORS.other;
                    return (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); navigate(`/events/${event.id}`); }}
                        className={cn(
                          "w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded-sm truncate font-bold transition-all cel-interactive",
                          colors.bg,
                          colors.text
                        )}
                        style={{ borderColor: INK }}
                        title={event.title}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedDay(key); }}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded-sm text-primary font-bold hover:bg-primary/10 transition-colors uppercase tracking-wide"
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend footer */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 bg-secondary flex-wrap"
          style={{ borderTop: `2px solid ${INK}` }}
        >
          {[
            { type: "practice", label: "Practice" },
            { type: "race", label: "Race" },
            { type: "social", label: "Social" },
            { type: "volunteer", label: "Volunteer" },
            { type: "other", label: "Other" },
          ].map(({ type, label }) => {
            const colors = EVENT_TYPE_COLORS[type];
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={cn("w-2.5 h-2.5 rounded-sm border", colors.dot)}
                  style={{ borderColor: INK }} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day overflow sheet */}
      <Sheet open={expandedDay !== null} onOpenChange={(open) => { if (!open) setExpandedDay(null); }}>
        <SheetContent
          side="bottom"
          className="max-h-[70vh] overflow-y-auto rounded-t-xl"
          style={{ border: `2px solid ${INK}`, borderBottom: "none", boxShadow: `0 -4px 0 ${INK}` }}
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="font-display text-2xl tracking-wider leading-none">
              {expandedDayLabel}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-4">
            {expandedDayEvents.map((event) => {
              const colors = EVENT_TYPE_COLORS[event.eventType] ?? EVENT_TYPE_COLORS.other;
              return (
                <button
                  key={event.id}
                  onClick={() => {
                    setExpandedDay(null);
                    navigate(`/events/${event.id}`);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-secondary transition-colors text-left cel-interactive"
                  style={{ borderColor: INK, boxShadow: `2px 2px 0 ${INK}` }}
                >
                  <div className={cn("w-3 h-3 rounded-sm border shrink-0", colors.dot)}
                    style={{ borderColor: INK }} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{event.title}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                      {format(parseISO(event.startTime), "h:mm a")} · {event.eventType}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
