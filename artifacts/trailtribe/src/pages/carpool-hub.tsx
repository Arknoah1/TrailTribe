import { useGetUpcomingEvents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, MapPin, Calendar, ChevronRight, Bike } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyTrailState, TrailDot } from "@/components/illustrations";

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
    <div className="max-w-4xl mx-auto space-y-6">

      <div className="px-6 md:px-8 space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-widest text-foreground leading-none">Carpools</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find a ride or offer one — pick an event to see the board.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "practice", "race"] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={cn(
              "min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold border-2 border-[#0a0c10] uppercase tracking-wide transition-all cel-interactive",
              filter === type
                ? "bg-primary text-primary-foreground shadow-cel-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground shadow-cel-sm"
            )}
          >
            {type === "all" ? "All Events" : type === "practice" ? "Practices" : "Races"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyTrailState
          message={`No upcoming ${filter !== "all" ? filter + " " : ""}events with carpool boards right now.`}
        />
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
    </div>
  );
}
