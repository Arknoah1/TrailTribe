import { useGetUpcomingEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import { EmptyTrailState, TrailDot } from "@/components/illustrations";

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

  const eventTypeStripe = (type: string) => {
    switch (type) {
      case "race": return "bg-accent";
      case "practice": return "bg-primary";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-4 md:pt-8">

      <div className="px-6 md:px-8 space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-widest text-foreground leading-none">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">What's happening this week.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl tracking-wider leading-none">Upcoming Events</h2>
          <Link href="/calendar" className="text-sm text-primary hover:underline font-bold uppercase tracking-wide">View Calendar</Link>
        </div>

        {events && events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map(event => (
              <Card key={event.id} className="overflow-hidden flex flex-col cel-hover cursor-pointer">
                <div className={`h-1.5 ${eventTypeStripe(event.eventType)}`} />
                <div className="bg-secondary px-4 py-2 border-b-2 border-[#0a0c10] flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">{event.eventType}</span>
                  <span className="text-xs font-medium text-muted-foreground">{format(new Date(event.startTime), "MMM d, yyyy")}</span>
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg"><Link href={`/events/${event.id}`} className="hover:text-primary transition-colors">{event.title}</Link></CardTitle>
                  {event.trailhead && (
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <TrailDot className="h-4 w-4 shrink-0" />
                      {event.trailhead.name}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t-2 border-[#0a0c10]">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs uppercase font-bold tracking-wide">RSVP:</span>
                      {event.myRsvp === "attending" ? (
                        <span className="flex items-center gap-1 text-primary font-bold text-xs uppercase tracking-wide"><CheckCircle2 className="h-3.5 w-3.5" /> YES</span>
                      ) : event.myRsvp === "not_attending" ? (
                        <span className="flex items-center gap-1 text-destructive font-bold text-xs uppercase tracking-wide"><XCircle className="h-3.5 w-3.5" /> NO</span>
                      ) : event.myRsvp === "maybe" ? (
                        <span className="flex items-center gap-1 text-accent font-bold text-xs uppercase tracking-wide"><HelpCircle className="h-3.5 w-3.5" /> MAYBE</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">None</span>
                      )}
                    </div>
                    <Link href={`/events/${event.id}`} className="text-primary font-bold text-xs uppercase tracking-wide hover:underline">Details →</Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyTrailState message="No upcoming events for your pod." />
        )}
      </div>
      </div>
    </div>
  );
}
