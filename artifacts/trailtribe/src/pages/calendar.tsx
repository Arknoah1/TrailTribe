import { useState, useMemo } from "react";
import { useListEvents } from "@workspace/api-client-react";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarIcon, MapPin, Car, List, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MonthCalendar } from "@/components/month-calendar";

type CalendarView = "list" | "month";

function getStoredView(): CalendarView {
  try {
    const v = localStorage.getItem("tt-calendar-view");
    if (v === "list" || v === "month") return v;
  } catch {}
  return "list";
}

export default function Calendar() {
  const [view, setView] = useState<CalendarView>(getStoredView);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const switchView = (v: CalendarView) => {
    setView(v);
    try { localStorage.setItem("tt-calendar-view", v); } catch {}
  };

  const monthParams = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(currentMonth));
    const gridEnd = endOfWeek(endOfMonth(currentMonth));
    return {
      startDate: gridStart.toISOString(),
      endDate: gridEnd.toISOString(),
    };
  }, [currentMonth]);

  const listParams = useMemo(() => ({}), []);

  const { data: events, isLoading } = useListEvents(
    view === "month" ? monthParams : listParams
  );

  const handleMonthChange = (date: Date) => {
    setCurrentMonth(startOfMonth(date));
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading calendar...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">Upcoming practices, races, and events.</p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg self-start md:self-auto">
          <button
            onClick={() => switchView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
            <span>List</span>
          </button>
          <button
            onClick={() => switchView("month")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "month"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Month view"
          >
            <LayoutGrid className="h-4 w-4" />
            <span>Month</span>
          </button>
        </div>
      </div>

      {view === "month" ? (
        <MonthCalendar
          events={events ?? []}
          month={currentMonth}
          onMonthChange={handleMonthChange}
        />
      ) : (
        <div className="space-y-4">
          {events && events.length > 0 ? (
            events.map(event => (
              <Card key={event.id} className="hover-elevate transition-all">
                <Link href={`/events/${event.id}`} className="block">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      <div className="bg-muted md:w-48 p-4 flex md:flex-col items-center md:justify-center justify-between border-b md:border-b-0 md:border-r border-border">
                        <div className="text-center">
                          <div className="text-sm font-semibold uppercase text-primary">{format(new Date(event.startTime), "MMM")}</div>
                          <div className="text-3xl font-bold">{format(new Date(event.startTime), "d")}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(event.startTime), "EEEE")}</div>
                        </div>
                        <div className="text-sm font-medium mt-0 md:mt-2">
                          {format(new Date(event.startTime), "h:mm a")}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-center">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant="outline" className="uppercase bg-background tracking-wider font-semibold">
                            {event.eventType}
                          </Badge>
                          {event.myRsvp && (
                            <Badge variant={event.myRsvp === "attending" ? "default" : "secondary"}>
                              {event.myRsvp === "attending" ? "Going" : event.myRsvp === "not_attending" ? "Not Going" : "Maybe"}
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{event.title}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-auto">
                          {event.trailhead && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              {event.trailhead.name}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Car className="h-4 w-4" />
                            {event.carpoolSpotsAvailable > 0 ? `${event.carpoolSpotsAvailable} seats available` : 'Carpools'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))
          ) : (
            <div className="text-center p-12 border rounded-lg bg-card">
              <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No events found</h3>
              <p className="text-muted-foreground">There are no upcoming events on the calendar.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
