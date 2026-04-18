import { useState, useMemo, useEffect, useRef } from "react";
import { useListEvents, useGetCalendarSubscribeUrl, useGetMe, useCreateEvent, useListTrailheads, useListPods, CreateEventBodyEventType, getListEventsQueryKey, PodWithStats } from "@workspace/api-client-react";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, MapPin, Car, List, LayoutGrid, Rss, Copy, Check, ExternalLink, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MonthCalendar } from "@/components/month-calendar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type CalendarView = "list" | "month";

function getStoredView(): CalendarView {
  try {
    const v = localStorage.getItem("tt-calendar-view");
    if (v === "list" || v === "month") return v;
  } catch {}
  return "list";
}

function getStoredPodFilter(): string | null {
  try {
    return localStorage.getItem("tt-calendar-pod-filter");
  } catch {}
  return null;
}

const emptyNewEvent = {
  title: "", description: "", eventType: CreateEventBodyEventType.practice,
  startDate: "", startTime: "09:00", endTime: "", trailheadId: "", isAllTeam: true, podId: "",
};

export default function Calendar() {
  const [view, setView] = useState<CalendarView>(getStoredView);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [copiedWhich, setCopiedWhich] = useState<"webcal" | "https" | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState(emptyNewEvent);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: trailheads } = useListTrailheads();
  const { data: pods } = useListPods();
  const createEvent = useCreateEvent();

  const isCoach = me?.role === "coach" || me?.role === "admin";

  const hadStoredFilter = useRef(getStoredPodFilter() !== null);
  const [podFilter, setPodFilterState] = useState<string>(() => getStoredPodFilter() ?? "all");

  const setPodFilter = (val: string) => {
    setPodFilterState(val);
    hadStoredFilter.current = true;
    try { localStorage.setItem("tt-calendar-pod-filter", val); } catch {}
  };

  useEffect(() => {
    if (!hadStoredFilter.current && me !== undefined && !isCoach && me?.podId) {
      setPodFilter(String(me.podId));
    }
  }, [me]);

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

  const { data: events, isLoading } = useListEvents(
    view === "month" ? monthParams : undefined
  );

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (podFilter === "all") return events;
    if (podFilter === "allteam") return events.filter(e => e.isAllTeam);
    return events.filter(e => e.isAllTeam || (e.podIds && e.podIds.some(pid => String(pid) === podFilter)));
  }, [events, podFilter]);

  const { data: subscribeData, isLoading: subscribeLoading } = useGetCalendarSubscribeUrl({
    query: { enabled: subscribeOpen },
  });

  const handleMonthChange = (date: Date) => {
    setCurrentMonth(startOfMonth(date));
  };

  const copyToClipboard = async (text: string, which: "webcal" | "https") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhich(which);
      setTimeout(() => setCopiedWhich(null), 2000);
    } catch {}
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

        <div className="flex items-center gap-2 self-start md:self-auto">
          {isCoach && (
            <Button
              size="sm"
              onClick={() => setShowAddEvent(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSubscribeOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Rss className="h-4 w-4" />
            Subscribe
          </Button>

          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
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
      </div>

      {view === "list" && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-nowrap sm:flex-wrap">
          {(["all", "allteam"] as const).map((val) => {
            const label = val === "all" ? "All Events" : "All Team";
            const active = podFilter === val;
            return (
              <button
                key={val}
                onClick={() => setPodFilter(val)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
          {(pods ?? []).map((pod: PodWithStats) => {
            const val = String(pod.id);
            const active = podFilter === val;
            return (
              <button
                key={val}
                onClick={() => setPodFilter(val)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                }`}
              >
                {pod.name}
              </button>
            );
          })}
        </div>
      )}

      {view === "month" ? (
        <MonthCalendar
          events={events ?? []}
          month={currentMonth}
          onMonthChange={handleMonthChange}
        />
      ) : (
        <div className="space-y-4">
          {filteredEvents.length > 0 ? (
            filteredEvents.map(event => (
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="uppercase bg-background tracking-wider font-semibold">
                              {event.eventType}
                            </Badge>
                            {event.isAllTeam
                              ? <Badge variant="outline" className="bg-background">All Team</Badge>
                              : event.podIds && event.podIds.length > 0
                                ? event.podIds.map(pid => {
                                    const pod = (pods ?? []).find(p => String(p.id) === String(pid));
                                    return pod
                                      ? <Badge key={pid} variant="outline" className="bg-background">Pod: {pod.name}</Badge>
                                      : null;
                                  })
                                : null
                            }
                          </div>
                          {event.myRsvp && (
                            <Badge variant={event.myRsvp === "attending" ? "default" : "secondary"}>
                              {event.myRsvp === "attending" ? "Going" : event.myRsvp === "not_attending" ? "Not Going" : "Maybe"}
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{event.title}</h3>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{event.description}</p>
                        )}
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
              {podFilter !== "all" ? (
                <p className="text-muted-foreground">
                  No upcoming events for this filter.{" "}
                  <button className="underline text-primary" onClick={() => setPodFilter("all")}>Show all events</button>
                </p>
              ) : (
                <p className="text-muted-foreground">There are no upcoming events on the calendar.</p>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={showAddEvent} onOpenChange={open => { setShowAddEvent(open); if (!open) setNewEvent(emptyNewEvent); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
            <DialogDescription>Fill in the details to create a new team event.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Title *</Label>
              <Input
                placeholder="e.g. Tuesday Practice"
                value={newEvent.title}
                onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder="e.g. Early season skills — bring snacks"
                value={newEvent.description}
                onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Type *</Label>
              <Select value={newEvent.eventType} onValueChange={v => setNewEvent(p => ({ ...p, eventType: v as CreateEventBodyEventType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.values(CreateEventBodyEventType) as string[]).map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date *</Label>
              <Input
                type="date"
                value={newEvent.startDate}
                onChange={e => setNewEvent(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Start time *</Label>
              <Input
                type="time"
                value={newEvent.startTime}
                onChange={e => setNewEvent(p => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">End time <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="time"
                value={newEvent.endTime}
                onChange={e => setNewEvent(p => ({ ...p, endTime: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Trailhead <span className="text-muted-foreground">(optional)</span></Label>
              <Select
                value={newEvent.trailheadId || "_none"}
                onValueChange={v => setNewEvent(p => ({ ...p, trailheadId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(trailheads ?? []).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label className="text-sm">Pod assignment</Label>
              <div className="flex items-center gap-2">
                <input
                  id="cal-add-all-team"
                  type="checkbox"
                  checked={newEvent.isAllTeam}
                  onChange={e => setNewEvent(p => ({ ...p, isAllTeam: e.target.checked, podId: "" }))}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <label htmlFor="cal-add-all-team" className="text-sm cursor-pointer select-none">All Team</label>
              </div>
              {!newEvent.isAllTeam && (
                <Select
                  value={newEvent.podId || "_none"}
                  onValueChange={v => setNewEvent(p => ({ ...p, podId: v === "_none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select a pod..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— select a pod —</SelectItem>
                    {(pods ?? []).map(pod => (
                      <SelectItem key={pod.id} value={String(pod.id)}>{pod.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={createEvent.isPending}
              onClick={() => {
                if (!newEvent.title.trim() || !newEvent.startDate || !newEvent.startTime) {
                  toast({ title: "Title, date, and start time are required", variant: "destructive" });
                  return;
                }
                if (!newEvent.isAllTeam && !newEvent.podId) {
                  toast({ title: "Select a pod, or check All Team", variant: "destructive" });
                  return;
                }
                const [y, m, d] = newEvent.startDate.split("-").map(Number);
                const [h, min] = newEvent.startTime.split(":").map(Number);
                const startDt = new Date(y, m - 1, d, h, min);
                let endDt: Date | null = null;
                if (newEvent.endTime) {
                  const [eh, emin] = newEvent.endTime.split(":").map(Number);
                  endDt = new Date(y, m - 1, d, eh, emin);
                }
                createEvent.mutate({
                  data: {
                    title: newEvent.title.trim(),
                    ...(newEvent.description.trim() ? { description: newEvent.description.trim() } : {}),
                    eventType: newEvent.eventType,
                    startTime: startDt.toISOString(),
                    ...(endDt ? { endTime: endDt.toISOString() } : {}),
                    ...(newEvent.trailheadId ? { trailheadId: Number(newEvent.trailheadId) } : {}),
                    isAllTeam: newEvent.isAllTeam,
                    ...(!newEvent.isAllTeam && newEvent.podId ? { podIds: [newEvent.podId] } : {}),
                  },
                }, {
                  onSuccess: () => {
                    toast({ title: `"${newEvent.title.trim()}" created` });
                    setNewEvent(emptyNewEvent);
                    setShowAddEvent(false);
                    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                  },
                  onError: () => toast({ title: "Failed to create event", variant: "destructive" }),
                });
              }}
            >
              {createEvent.isPending ? "Saving..." : "Save Event"}
            </Button>
            <Button variant="outline" onClick={() => { setShowAddEvent(false); setNewEvent(emptyNewEvent); }} disabled={createEvent.isPending}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={subscribeOpen} onOpenChange={setSubscribeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rss className="h-5 w-5 text-primary" />
              Subscribe to Team Calendar
            </DialogTitle>
            <DialogDescription>
              Add the TrailTribe team calendar to your Google Calendar, Apple Calendar, or Outlook. Events stay automatically in sync.
            </DialogDescription>
          </DialogHeader>

          {subscribeLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Generating your personal link...</div>
          ) : subscribeData ? (
            <div className="space-y-5 mt-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold">One-click subscribe</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 truncate font-mono">
                    {subscribeData.subscribeUrl}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(subscribeData.subscribeUrl, "webcal")}
                    title="Copy link"
                  >
                    {copiedWhich === "webcal" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    asChild
                    title="Open in calendar app"
                  >
                    <a href={subscribeData.subscribeUrl}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Click the open button to subscribe directly in your default calendar app.</p>
                <a
                  href={subscribeData.httpsUrl}
                  download="trailtribe-team.ics"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="h-3 w-3" />
                  Download .ics file instead
                </a>
              </div>

              <div className="space-y-3 text-sm">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-xs">Platform instructions</p>

                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Google Calendar</p>
                  <p className="text-xs text-muted-foreground">Open Google Calendar → click <span className="font-medium">+</span> next to "Other calendars" → <span className="font-medium">From URL</span> → paste the link above.</p>
                </div>

                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Apple Calendar (Mac / iPhone)</p>
                  <p className="text-xs text-muted-foreground">In Calendar, go to <span className="font-medium">File → New Calendar Subscription</span> and paste the webcal:// link above. Or just click the open button — Safari will prompt you automatically.</p>
                </div>

                <div className="rounded-lg border p-3 space-y-1">
                  <p className="font-medium">Outlook</p>
                  <p className="text-xs text-muted-foreground">
                    Copy the HTTPS link below → Outlook → <span className="font-medium">Add calendar</span> → <span className="font-medium">Subscribe from web</span> → paste it in.
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs bg-muted rounded px-2 py-1 truncate font-mono">
                      {subscribeData.httpsUrl}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(subscribeData.httpsUrl, "https")}
                      title="Copy HTTPS link"
                    >
                      {copiedWhich === "https" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                This link is personal — do not share it. Anyone with this link can read the team schedule.
              </p>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-destructive">Failed to load subscribe link. Try again.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
