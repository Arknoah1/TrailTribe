import { useGetUpcomingEvents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, MapPin, Calendar, ChevronRight, Bike } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";

type EventTypeFilter = "all" | "practice" | "race";

export default function CarpoolHub() {
  const { data: events, isLoading } = useGetUpcomingEvents();
  const [filter, setFilter] = useState<EventTypeFilter>("all");

  const carpoolEvents = events?.filter(e =>
    ["practice", "race"].includes(e.eventType)
  ) ?? [];

  const filtered = filter === "all"
    ? carpoolEvents
    : carpoolEvents.filter(e => e.eventType === filter);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-10 bg-muted rounded w-full" />
        <div className="h-28 bg-muted rounded" />
        <div className="h-28 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Carpools</h1>
        <p className="text-muted-foreground mt-1">
          Find a ride or offer one — pick an event to see the board.
        </p>
      </div>

      <div className="flex gap-2">
        {(["all", "practice", "race"] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize",
              filter === type
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            )}
          >
            {type === "all" ? "All Events" : type === "practice" ? "Practices" : "Races"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Car className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-lg font-medium">No upcoming events</h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              There are no upcoming {filter !== "all" ? filter + " " : ""}events with carpool boards right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(event => (
            <Link key={event.id} href={`/carpools/${event.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={cn(
                        "rounded-lg p-2.5 shrink-0",
                        event.eventType === "race"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-primary/10 text-primary"
                      )}>
                        {event.eventType === "race"
                          ? <Bike className="h-5 w-5" />
                          : <Car className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge
                            variant={event.eventType === "race" ? "default" : "secondary"}
                            className="text-[10px] uppercase tracking-wider font-semibold"
                          >
                            {event.eventType}
                          </Badge>
                        </div>
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                          {event.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(event.startTime), "EEE, MMM d · h:mm a")}
                          </span>
                          {event.trailhead && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {event.trailhead.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {event.carpoolSpotsAvailable > 0 && (
                        <span className="bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">
                          {event.carpoolSpotsAvailable} spots
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
