import { useGetUpcomingEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { MapPin, CalendarDays, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: events, isLoading: isLoadingEvents } = useGetUpcomingEvents();

  if (isLoadingEvents) {
    return <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-muted rounded"></div>
        <div className="h-40 bg-muted rounded"></div>
      </div>
    </div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">What's happening this week.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Upcoming Events</h2>
          <Link href="/calendar" className="text-sm text-primary hover:underline font-medium">View Calendar</Link>
        </div>

        {events && events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map(event => (
              <Card key={event.id} className="overflow-hidden flex flex-col">
                <div className="bg-primary/10 px-4 py-2 border-b border-border flex justify-between items-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">{event.eventType}</span>
                  <span className="text-xs font-medium text-muted-foreground">{format(new Date(event.startTime), "MMM d, yyyy")}</span>
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg"><Link href={`/events/${event.id}`} className="hover:underline">{event.title}</Link></CardTitle>
                  {event.trailhead && (
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.trailhead.name}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">My RSVP:</span>
                      {event.myRsvp === "attending" ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-500 font-medium"><CheckCircle2 className="h-4 w-4" /> Yes</span>
                      ) : event.myRsvp === "not_attending" ? (
                        <span className="flex items-center gap-1 text-destructive font-medium"><XCircle className="h-4 w-4" /> No</span>
                      ) : event.myRsvp === "maybe" ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500 font-medium"><HelpCircle className="h-4 w-4" /> Maybe</span>
                      ) : (
                        <span className="text-muted-foreground italic">None</span>
                      )}
                    </div>
                    <Link href={`/events/${event.id}`} className="text-primary hover:underline font-medium">Details</Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No upcoming events</h3>
              <p className="text-muted-foreground max-w-sm mt-2">There are no events scheduled for your pod in the near future.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
