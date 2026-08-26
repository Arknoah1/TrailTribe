import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEventTasksQueryKey,
  useBulkSignupForEventTasks,
  useGetMe,
  useGetMyVolunteerSignups,
  useListEvents,
  useListEventTasks,
} from "@workspace/api-client-react";
import { AlertTriangle, ClipboardCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRoutePerformance } from "@/lib/route-performance";

type VolunteerEvent = {
  id: number;
  title: string;
  startTime: string;
  volunteerTasksEnabled?: boolean;
};

function EventTaskLoader({
  eventId,
  onLoad,
}: {
  eventId: number;
  onLoad: (id: number, tasks: any[]) => void;
}) {
  const { data: tasks } = useListEventTasks(eventId, {
    query: { enabled: true, queryKey: getListEventTasksQueryKey(eventId) },
  });

  useEffect(() => {
    if (tasks) onLoad(eventId, tasks);
  }, [eventId, tasks, onLoad]);

  return null;
}

function CrossEventSignupPanel({ events }: { events: VolunteerEvent[] }) {
  const [attendedIds, setAttendedIds] = useState<Set<number>>(new Set());
  const [tasksByEvent, setTasksByEvent] = useState<Map<number, any[]>>(new Map());
  const bulkSignup = useBulkSignupForEventTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTasksLoaded = useCallback((eventId: number, tasks: any[]) => {
    setTasksByEvent((previous) => {
      const next = new Map(previous);
      next.set(eventId, tasks);
      return next;
    });
  }, []);

  const toggleAttended = (eventId: number) => {
    setAttendedIds((previous) => {
      const next = new Set(previous);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const taskGroups = useMemo(() => {
    const groups = new Map<string, { eventId: number; taskId: number; eventTitle: string }[]>();
    for (const eventId of attendedIds) {
      const tasks = tasksByEvent.get(eventId) ?? [];
      const event = events.find((candidate) => candidate.id === eventId);
      for (const task of tasks) {
        if (task.mySignup) continue;
        const filled = task.signups?.length ?? 0;
        if (filled >= task.slotsNeeded) continue;
        if (!groups.has(task.title)) groups.set(task.title, []);
        groups.get(task.title)!.push({ eventId, taskId: task.id, eventTitle: event?.title ?? "" });
      }
    }
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [attendedIds, events, tasksByEvent]);

  const selectedEventIds = [...attendedIds];
  const isLoadingSelectedTasks = selectedEventIds.some((eventId) => !tasksByEvent.has(eventId));

  const applyTask = async (
    title: string,
    occurrences: { eventId: number; taskId: number }[],
  ) => {
    const results = await Promise.all(
      occurrences.map(({ eventId, taskId }) =>
        bulkSignup
          .mutateAsync({ id: eventId, data: { taskIds: [taskId] } })
          .catch(() => null),
      ),
    );
    const added = results.reduce((total, result) => total + (result?.added ?? 0), 0);
    const skipped = results.reduce((total, result) => total + (result?.skipped ?? 0), 0);

    occurrences.forEach(({ eventId }) => {
      queryClient.invalidateQueries({ queryKey: getListEventTasksQueryKey(eventId) });
    });

    if (added > 0) {
      toast({
        title: `Signed up for "${title}" at ${added} event${added === 1 ? "" : "s"}`,
        description: skipped > 0 ? `${skipped} task${skipped === 1 ? " was" : "s were"} already filled or claimed.` : undefined,
      });
      return;
    }

    toast({
      title: "That task is no longer available",
      description: "Refresh the opportunities below and choose another task.",
      variant: "destructive",
    });
  };

  if (events.length < 2) return null;

  const selectionHint = attendedIds.size === 0
    ? "Choose the events you expect to attend. We’ll show recurring open tasks you can claim across them."
    : attendedIds.size === 1
      ? "Choose another event to compare recurring tasks."
      : isLoadingSelectedTasks
        ? "Finding open tasks at your selected events…"
        : "Choose a recurring task below to sign up at every selected event where it is available.";

  return (
    <Card className="border-2 border-[#0a0c10] shadow-cel-sm">
      <CardHeader className="pb-3">
        <CardTitle id="multiple-events-heading" className="flex items-center gap-2 text-xl">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Apply to Multiple Events
        </CardTitle>
        <p className="text-sm text-muted-foreground" id="multiple-events-help">
          Save time on recurring work by selecting the events you expect to attend first.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset aria-describedby="multiple-events-help">
          <legend className="text-sm font-semibold">Events I’m attending</legend>
          <div className="mt-2 space-y-2">
            {events.map((event) => {
              const inputId = `volunteer-event-${event.id}`;
              return (
                <div
                  key={event.id}
                  className="rounded-lg border border-border bg-card transition-colors hover:bg-muted/30 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-primary"
                    checked={attendedIds.has(event.id)}
                    onChange={() => toggleAttended(event.id)}
                  />
                  <label
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-sm font-medium">{event.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(event.startTime), "MMM d")}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {selectedEventIds.map((eventId) => (
          <EventTaskLoader key={eventId} eventId={eventId} onLoad={handleTasksLoaded} />
        ))}

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selectionHint}
        </p>

        {attendedIds.size > 0 && taskGroups.length > 0 && !isLoadingSelectedTasks && (
          <section className="space-y-2" aria-live="polite" aria-labelledby="recurring-tasks-heading">
            <h3 id="recurring-tasks-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recurring open tasks
            </h3>
            {taskGroups.map(([title, occurrences]) => (
              <div key={title} className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {occurrences.length === 1
                      ? `Available at ${occurrences[0].eventTitle}`
                      : `Available at ${occurrences.length} selected events`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={occurrences.length > 1 ? "default" : "outline"}
                  onClick={() => void applyTask(title, occurrences)}
                  disabled={bulkSignup.isPending}
                  className="min-h-11 shrink-0"
                >
                  {bulkSignup.isPending
                    ? "Saving…"
                    : occurrences.length > 1
                      ? `Sign up at all ${occurrences.length}`
                      : "Sign up"}
                </Button>
              </div>
            ))}
          </section>
        )}

        {attendedIds.size > 0 && taskGroups.length === 0 && !isLoadingSelectedTasks && (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground" aria-live="polite">
            No recurring open tasks are available at your selected events. You can still choose individual tasks below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function VolunteerOpportunityCard({ event }: { event: VolunteerEvent }) {
  const { data: tasks, isLoading, isError, refetch } = useListEventTasks(event.id, {
    query: { enabled: true, queryKey: getListEventTasksQueryKey(event.id) },
  });
  const bulkSignup = useBulkSignupForEventTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const openTasks = (tasks ?? []).filter((task: any) => {
    const filled = task.signups?.length ?? 0;
    return !task.mySignup && filled < task.slotsNeeded;
  });

  const toggle = (id: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    if (selected.size === 0) return;
    bulkSignup.mutate(
      { id: event.id, data: { taskIds: [...selected] } },
      {
        onSuccess: (result: any) => {
          const added = result?.added ?? 0;
          const skipped = result?.skipped ?? 0;
          setSelected(new Set());
          queryClient.invalidateQueries({ queryKey: getListEventTasksQueryKey(event.id) });
          if (added > 0) {
            toast({
              title: `Signed up for ${added} task${added === 1 ? "" : "s"} at ${event.title}`,
              description: skipped > 0 ? `${skipped} selected task${skipped === 1 ? " was" : "s were"} no longer available.` : undefined,
            });
          } else {
            toast({
              title: "Those tasks are no longer available",
              description: "Choose another open task and try again.",
              variant: "destructive",
            });
          }
        },
        onError: () => toast({
          title: "Couldn’t save your volunteer signup",
          description: "Check your connection and try again.",
          variant: "destructive",
        }),
      },
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading open tasks…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/60 bg-destructive/10">
        <CardContent className="flex min-h-28 flex-col items-start justify-center gap-3 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm">Couldn’t load volunteer tasks for {event.title}.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (openTasks.length === 0) return null;

  const eventHeadingId = `volunteer-opportunity-${event.id}`;
  return (
    <Card className="border-2 border-[#0a0c10] shadow-cel-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle id={eventHeadingId} className="text-base">{event.title}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{format(new Date(event.startTime), "EEEE, MMM d")}</p>
          </div>
          <Badge variant="outline" className="shrink-0">{openTasks.length} open</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-1">
        <fieldset aria-labelledby={eventHeadingId}>
          <legend className="sr-only">Choose volunteer tasks for {event.title}</legend>
          <div className="space-y-2">
            {openTasks.map((task: any) => {
              const inputId = `volunteer-task-${event.id}-${task.id}`;
              return (
                <div
                  key={task.id}
                  className="rounded-lg transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                    checked={selected.has(task.id)}
                    onChange={() => toggle(task.id)}
                  />
                  <label
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{task.title}</span>
                      {task.description && <span className="mt-0.5 block text-xs text-muted-foreground">{task.description}</span>}
                    </span>
                    {task.category && (
                      <Badge variant="secondary" className="max-w-[45%] shrink-0 whitespace-normal text-right leading-tight">
                        {task.category}
                      </Badge>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size === 0 ? "Select one or more tasks to continue." : `${selected.size} task${selected.size === 1 ? "" : "s"} selected.`}
          </p>
          <Button
            className="min-h-11 sm:min-w-36"
            onClick={handleApply}
            disabled={selected.size === 0 || bulkSignup.isPending}
          >
            {bulkSignup.isPending ? "Saving…" : `Sign Up${selected.size > 0 ? ` for ${selected.size}` : ""}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Commitments({ signups }: { signups: any[] }) {
  const now = new Date();
  const upcoming = signups.filter((signup) => {
    const startTime = signup.event?.startTime ? new Date(signup.event.startTime) : null;
    return startTime && startTime >= now;
  });
  const past = signups.filter((signup) => {
    const startTime = signup.event?.startTime ? new Date(signup.event.startTime) : null;
    return startTime && startTime < now;
  });

  const renderGroup = (items: any[], label: string) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      {items.map((signup) => {
        const eventStart = signup.event?.startTime ? new Date(signup.event.startTime) : null;
        const eventTitle = signup.event?.title ?? "this event";
        return (
          <Card key={signup.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{signup.task?.title ?? "Volunteer task"}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {eventTitle}{eventStart && <> · {format(eventStart, "EEEE, MMM d")}</>}
                </p>
                {signup.task?.category && <Badge variant="secondary" className="mt-2 whitespace-normal">{signup.task.category}</Badge>}
              </div>
              {signup.event?.id && (
                <Link
                  href={`/events/${signup.event.id}`}
                  aria-label={`View details for ${eventTitle}`}
                  className="min-h-11 shrink-0 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  View event
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  if (signups.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="commitments-heading">
      <div>
        <h2 id="commitments-heading" className="text-xl font-bold">My Commitments</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Your confirmed volunteer tasks, ordered by event date.</p>
      </div>
      {upcoming.length > 0 && renderGroup(upcoming, `Upcoming (${upcoming.length})`)}
      {past.length > 0 && (
        <details className="rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Past commitments ({past.length})</summary>
          <div className="mt-3">{renderGroup(past, "Past events")}</div>
        </details>
      )}
    </section>
  );
}

export default function Volunteer() {
  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
    refetch: refetchUser,
  } = useGetMe();
  const {
    data: signups,
    isLoading: signupsLoading,
    isError: signupsError,
    refetch: refetchSignups,
  } = useGetMyVolunteerSignups();
  const {
    data: allEvents,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useListEvents();

  const isLoading = userLoading || signupsLoading || eventsLoading;
  const isError = userError || signupsError || eventsError;
  useRoutePerformance("volunteer", user !== undefined, !isLoading);

  const upcomingVolunteerEvents = (allEvents ?? []).filter((event: any) => (
    event.volunteerTasksEnabled && new Date(event.startTime) >= new Date()
  )) as VolunteerEvent[];
  const isStudent = user?.role === "student";
  const hasContent = (signups?.length ?? 0) > 0 || upcomingVolunteerEvents.length > 0;

  const retry = () => {
    void refetchUser();
    void refetchSignups();
    void refetchEvents();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Volunteer</h1>
        <p className="mt-1 text-muted-foreground">
          Find a role that fits, sign up, and keep your team commitments in one place.
        </p>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading volunteer opportunities…
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-2 border-destructive/60 bg-destructive/10">
          <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
            <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Couldn’t load volunteer information</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Check your connection and try again.</p>
            </div>
            <Button variant="outline" onClick={retry}>Retry</Button>
          </CardContent>
        </Card>
      ) : !hasContent ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-3 h-9 w-9 text-primary opacity-50" />
            <p className="text-base font-semibold">
              {isStudent ? "No volunteer opportunities yet" : "No volunteer activity yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm">
              {isStudent
                ? "Your coach can open volunteer tasks for an upcoming event. Check back soon or view the event details."
                : "When your team opens volunteer tasks for an upcoming event, they’ll appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <CrossEventSignupPanel events={upcomingVolunteerEvents} />
          <Commitments signups={signups ?? []} />
          {upcomingVolunteerEvents.length > 0 && (
            <section className="space-y-4" aria-labelledby="opportunities-heading">
              <div>
                <h2 id="opportunities-heading" className="text-xl font-bold">Volunteer Opportunities</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Choose one or more open tasks for a specific event.
                </p>
              </div>
              {upcomingVolunteerEvents.map((event) => (
                <VolunteerOpportunityCard key={event.id} event={event} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}