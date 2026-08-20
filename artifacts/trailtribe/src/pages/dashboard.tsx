import { useState, useEffect } from "react";
import { useGetMe, useGetUpcomingEvents, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, Car, ShieldCheck, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EmptyTrailState, TrailDot } from "@/components/illustrations";
import { Button } from "@/components/ui/button";

const COACH_WELCOMED_KEY = "trailtribe_coach_welcomed";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const { data: events, isLoading: isLoadingEvents, isError: isEventsError, refetch: refetchEvents } = useGetUpcomingEvents();
  const { data: summary } = useGetDashboardSummary();

  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  const emailWarning = isCoachOrAdmin && summary != null && !summary.emailConfigured;

  const [coachWelcomeSeen, setCoachWelcomeSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COACH_WELCOMED_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Clear the welcome-seen flag when the user is demoted back to a non-coach role
  // so the banner will re-appear if they are ever promoted again.
  useEffect(() => {
    if (me?.role === "parent" || me?.role === "student") {
      try {
        localStorage.removeItem(COACH_WELCOMED_KEY);
      } catch {}
      setCoachWelcomeSeen(false);
    }
  }, [me?.role]);

  function dismissCoachWelcome() {
    try {
      localStorage.setItem(COACH_WELCOMED_KEY, "true");
    } catch {}
    setCoachWelcomeSeen(true);
  }

  if (isLoadingEvents) {
    return <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-muted rounded"></div>
        <div className="h-40 bg-muted rounded"></div>
      </div>
    </div>;
  }

  if (isEventsError) {
    return (
      <div className="max-w-6xl mx-auto pt-4 md:pt-8 px-6 md:px-8">
        <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">Couldn't load your dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchEvents()} className="shrink-0">
            Retry
          </Button>
        </div>
      </div>
    );
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

        {/* Email health warning banner — coaches/admins only */}
        {emailWarning && (
          <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-foreground">Email delivery is not working</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The app could not connect to the email server. Families will not receive notifications until this is resolved.
                Check that the SMTP credentials (SMTP_USER / SMTP_PASS) are correctly set in the server environment.
              </p>
            </div>
          </div>
        )}

        {/* Coach/admin welcome banner — shown once per browser until dismissed */}
        {isCoachOrAdmin && !coachWelcomeSeen && (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5 flex flex-col sm:flex-row items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">You have coach/admin access</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Your account was upgraded. You can manage the team roster, events, pods, and more from the Admin section.
                To show the Admin tab in your navigation, go to{" "}
                <strong className="text-foreground">Profile → Admin Mode</strong>{" "}
                and turn on "Show admin tabs".
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Link href="/profile">
                  <Button size="sm" variant="outline" className="text-xs h-7 px-3">
                    Go to Profile
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" className="text-xs h-7 px-3" onClick={dismissCoachWelcome}>
                  Got it
                </Button>
              </div>
            </div>
            <button
              onClick={dismissCoachWelcome}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}


        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl tracking-wider leading-none">Upcoming Events</h2>
            <Link href="/calendar" className="text-sm text-primary hover:underline font-bold uppercase tracking-wide">View Calendar</Link>
          </div>

          {events && events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map(event => (
                <Card
                  key={event.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${event.title}`}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest("a, button")) return;
                    setLocation(`/events/${event.id}`);
                  }}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                      e.preventDefault();
                      setLocation(`/events/${event.id}`);
                    }
                  }}
                  className="overflow-hidden flex flex-col cel-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
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
                        {event.householdRsvps && event.householdRsvps.length > 0 ? (
                          (() => {
                            const attending = event.householdRsvps!.filter(m => m.status === "attending");
                            const notAttending = event.householdRsvps!.filter(m => m.status === "not_attending");
                            if (attending.length > 0) {
                              const names = attending.map(m => m.isMe ? "You" : m.firstName);
                              return (
                                <span className="flex items-center gap-1 text-primary font-bold text-xs uppercase tracking-wide">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  {names.join(" · ")} going
                                </span>
                              );
                            } else if (notAttending.length === event.householdRsvps!.length) {
                              return (
                                <span className="flex items-center gap-1 text-destructive font-bold text-xs uppercase tracking-wide">
                                  <XCircle className="h-3.5 w-3.5" /> Not going
                                </span>
                              );
                            } else {
                              return <span className="text-muted-foreground text-xs italic">None</span>;
                            }
                          })()
                        ) : event.myRsvp === "attending" ? (
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
                    {!isCoachOrAdmin && (event as any).carpoolSpotsAvailable > 0 && (
                      <Link
                        href={`/carpools/${event.id}`}
                        className="flex items-center gap-1.5 mt-3 text-xs font-bold uppercase tracking-wide text-primary hover:underline"
                      >
                        <Car className="h-3.5 w-3.5 shrink-0" />
                        {(event as any).carpoolSpotsAvailable} seat{(event as any).carpoolSpotsAvailable === 1 ? "" : "s"} available — grab one
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyTrailState
              message={me?.role === "student"
                ? "No upcoming events are assigned to your pod yet. Ask your coach if you expected to see one."
                : "No upcoming events for your pod."}
            />
          )}
        </div>
      </div>
    </div>
  );
}
