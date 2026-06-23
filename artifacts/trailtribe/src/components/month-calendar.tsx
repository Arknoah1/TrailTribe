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

const EVENT_TYPE_COLORS: Record<string, string> = {
  practice: "bg-emerald-600 text-white hover:bg-emerald-700",
  race: "bg-red-600 text-white hover:bg-red-700",
  social: "bg-purple-600 text-white hover:bg-purple-700",
  volunteer: "bg-amber-500 text-white hover:bg-amber-600",
  other: "bg-muted text-muted-foreground hover:bg-muted/80",
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
}

export function MonthCalendar({ events, month, onMonthChange }: MonthCalendarProps) {
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">{format(month, "MMMM yyyy")}</h2>
            <button
              onClick={goToday}
              className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors font-medium"
            >
              Today
            </button>
          </div>

          <button
            onClick={goNext}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-border">
          {DOW_LABELS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

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
                  "min-h-[5rem] p-1 border-border",
                  !isLastRow && "border-b",
                  idx % 7 !== 6 && "border-r",
                  !inMonth && "bg-muted/20",
                  today && "bg-primary/5"
                )}
              >
                <div className={cn(
                  "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 mx-auto",
                  today
                    ? "bg-primary text-primary-foreground font-bold"
                    : inMonth
                    ? "text-foreground"
                    : "text-muted-foreground/50"
                )}>
                  {format(day, "d")}
                </div>

                <div className="space-y-0.5">
                  {showEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/events/${event.id}`)}
                      className={cn(
                        "w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium transition-colors",
                        EVENT_TYPE_COLORS[event.eventType] ?? EVENT_TYPE_COLORS.other
                      )}
                      title={event.title}
                    >
                      {event.title}
                    </button>
                  ))}
                  {overflow > 0 && (
                    <button
                      onClick={() => setExpandedDay(key)}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/60 transition-colors font-medium"
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border bg-muted/20 flex-wrap">
          {[
            { type: "practice", label: "Practice" },
            { type: "race", label: "Race" },
            { type: "social", label: "Social" },
            { type: "volunteer", label: "Volunteer" },
            { type: "other", label: "Other" },
          ].map(({ type, label }) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-sm", EVENT_TYPE_COLORS[type].split(" ")[0])} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={expandedDay !== null} onOpenChange={(open) => { if (!open) setExpandedDay(null); }}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{expandedDayLabel}</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-4">
            {expandedDayEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => {
                  setExpandedDay(null);
                  navigate(`/events/${event.id}`);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  (EVENT_TYPE_COLORS[event.eventType] ?? EVENT_TYPE_COLORS.other).split(" ")[0]
                )} />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{event.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(parseISO(event.startTime), "h:mm a")} · {event.eventType}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
