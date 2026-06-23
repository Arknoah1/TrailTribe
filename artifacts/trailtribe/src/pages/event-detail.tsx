import {
  useGetEvent, useRsvpEvent, useUpdateEvent, useGetMe, useListTrailheads, useListPods,
  useListEventTasks, useSignUpForEventTask, useCancelEventTaskSignup,
  useSetEventVolunteerTasksEnabled, useCreateEventTask, useDeleteEventTask,
  useAddEventTasksFromTemplates, useListVolunteerTemplateTasks,
  getListEventTasksQueryKey, getListVolunteerTemplateTasksQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { MapPin, Calendar as CalendarIcon, Users, Car, FileText, ChevronLeft, Map, Pencil, CheckCircle2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEventQueryKey, getListEventsQueryKey, UpdateEventBodyEventType } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const EVENT_TYPES = Object.values(UpdateEventBodyEventType) as string[];

export default function EventDetail() {
  const params = useParams();
  const eventId = parseInt(params.id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: event, isLoading } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) }
  });
  const { data: me } = useGetMe();
  const { data: trailheads } = useListTrailheads();
  const { data: pods } = useListPods();
  const updateEvent = useUpdateEvent();

  const isCoach = me?.role === "coach" || me?.role === "admin";

  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState<{
    title: string;
    description: string;
    eventType: string;
    startDate: string;
    startTime: string;
    endTime: string;
    trailheadId: string;
    isAllTeam: boolean;
    podId: string;
  }>({
    title: "", description: "", eventType: "practice",
    startDate: "", startTime: "", endTime: "",
    trailheadId: "", isAllTeam: true, podId: "",
  });

  // ─── VOLUNTEER TASK STATE ──────────────────────────────────────────────────
  const volunteerTasksEnabled = (event as any)?.volunteerTasksEnabled ?? false;
  const showVolunteerSection = volunteerTasksEnabled || isCoach;

  const { data: tasks } = useListEventTasks(eventId, {
    query: { enabled: !!eventId && showVolunteerSection, queryKey: getListEventTasksQueryKey(eventId) }
  });
  const { data: templates } = useListVolunteerTemplateTasks({
    query: { enabled: isCoach, queryKey: getListVolunteerTemplateTasksQueryKey() }
  });

  const setEnabledMut = useSetEventVolunteerTasksEnabled();
  const signUpMut = useSignUpForEventTask();
  const cancelMut = useCancelEventTaskSignup();
  const createTaskMut = useCreateEventTask();
  const deleteTaskMut = useDeleteEventTask();
  const addFromTemplatesMut = useAddEventTasksFromTemplates();

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTplIds, setSelectedTplIds] = useState<Set<number>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ category: "", title: "", description: "", slotsNeeded: 1 });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: getListEventTasksQueryKey(eventId) });
  const invalidateEvent = () => {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
  };

  const handleToggleEnabled = () => {
    const newVal = !volunteerTasksEnabled;
    setEnabledMut.mutate({ id: eventId, data: { enabled: newVal } }, {
      onSuccess: () => {
        invalidateEvent();
        toast({ title: newVal ? "Volunteer tasks enabled" : "Volunteer tasks disabled" });
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };

  const handleSignUp = (taskId: number) => {
    signUpMut.mutate({ id: eventId, taskId, data: {} }, {
      onSuccess: () => { invalidateTasks(); toast({ title: "Signed up!" }); },
      onError: () => toast({ title: "Failed to sign up", variant: "destructive" }),
    });
  };

  const handleCancel = (taskId: number) => {
    cancelMut.mutate({ id: eventId, taskId }, {
      onSuccess: () => { invalidateTasks(); toast({ title: "Signup cancelled" }); },
      onError: () => toast({ title: "Failed to cancel", variant: "destructive" }),
    });
  };

  const handleDeleteTask = (taskId: number) => {
    deleteTaskMut.mutate({ id: eventId, taskId }, {
      onSuccess: () => invalidateTasks(),
      onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
    });
  };

  const handleAddFromTemplates = () => {
    if (selectedTplIds.size === 0) return;
    addFromTemplatesMut.mutate(
      { id: eventId, data: { templateTaskIds: [...selectedTplIds] } },
      {
        onSuccess: (data) => {
          toast({ title: `${data.added} task${data.added !== 1 ? "s" : ""} added` });
          setShowTemplateSelector(false);
          setSelectedTplIds(new Set());
          invalidateTasks();
        },
        onError: () => toast({ title: "Failed to add tasks", variant: "destructive" }),
      }
    );
  };

  const handleCreateTask = () => {
    if (!newTask.category.trim() || !newTask.title.trim()) {
      toast({ title: "Category and title required", variant: "destructive" });
      return;
    }
    createTaskMut.mutate(
      {
        id: eventId,
        data: {
          category: newTask.category.trim(),
          title: newTask.title.trim(),
          description: newTask.description.trim() || undefined,
          slotsNeeded: newTask.slotsNeeded,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task added" });
          setShowAddTask(false);
          setNewTask({ category: "", title: "", description: "", slotsNeeded: 1 });
          invalidateTasks();
        },
        onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
      }
    );
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const tasksByCategory = (tasks ?? []).reduce<Record<string, typeof tasks>>((acc, t) => {
    const cat = t.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(t);
    return acc;
  }, {});
  const categories = Object.keys(tasksByCategory).sort();

  const templatesByCategory = (templates ?? []).reduce<Record<string, typeof templates>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category]!.push(t);
    return acc;
  }, {});
  const templateCategories = Object.keys(templatesByCategory).sort();

  // ─── EDIT EVENT ────────────────────────────────────────────────────────────
  const openEdit = () => {
    if (!event) return;
    const startDt = new Date(event.startTime);
    const endDt = event.endTime ? new Date(event.endTime) : null;
    setEditData({
      title: event.title,
      description: event.description ?? "",
      eventType: event.eventType,
      startDate: startDt.toISOString().split("T")[0],
      startTime: startDt.toTimeString().slice(0, 5),
      endTime: endDt ? endDt.toTimeString().slice(0, 5) : "",
      trailheadId: event.trailhead ? String(event.trailhead.id) : "",
      isAllTeam: event.isAllTeam ?? true,
      podId: "",
    });
    setShowEdit(true);
  };

  const handleSave = () => {
    if (!editData.title.trim() || !editData.startDate || !editData.startTime) {
      toast({ title: "Title, date, and start time are required", variant: "destructive" });
      return;
    }
    if (!editData.isAllTeam && !editData.podId) {
      toast({ title: "Select a pod, or check All Team", variant: "destructive" });
      return;
    }
    const [y, m, d] = editData.startDate.split("-").map(Number);
    const [h, min] = editData.startTime.split(":").map(Number);
    const startDt = new Date(y, m - 1, d, h, min);
    let endDt: Date | null = null;
    if (editData.endTime) {
      const [eh, emin] = editData.endTime.split(":").map(Number);
      endDt = new Date(y, m - 1, d, eh, emin);
    }
    updateEvent.mutate({
      id: eventId,
      data: {
        title: editData.title.trim(),
        ...(editData.description.trim() ? { description: editData.description.trim() } : { description: "" }),
        eventType: editData.eventType as UpdateEventBodyEventType,
        startTime: startDt.toISOString(),
        ...(endDt ? { endTime: endDt.toISOString() } : { endTime: undefined }),
        ...(editData.trailheadId ? { trailheadId: Number(editData.trailheadId) } : { trailheadId: undefined }),
        isAllTeam: editData.isAllTeam,
        ...(!editData.isAllTeam && editData.podId ? { podIds: [editData.podId] } : {}),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Event updated" });
        setShowEdit(false);
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      },
      onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
    });
  };

  const rsvpMutation = useRsvpEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      }
    }
  });

  const handleRsvp = (status: "attending" | "not_attending" | "maybe") => {
    rsvpMutation.mutate({ id: eventId, data: { status } });
  };

  if (isLoading) return <div className="p-8 text-center">Loading event...</div>;
  if (!event) return <div className="p-8 text-center text-destructive">Event not found</div>;

  const mapUrl = event.googleMapsUrlOverride || event.trailhead?.googleMapsUrl;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link href="/calendar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Calendar
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="uppercase tracking-wider font-semibold">{event.eventType}</Badge>
          {event.isAllTeam
            ? <Badge variant="outline">All Team</Badge>
            : event.podIds && event.podIds.length > 0
              ? event.podIds.map(pid => {
                  const pod = (pods ?? []).find(p => String(p.id) === String(pid));
                  return pod
                    ? (
                      <Badge key={pid} variant="outline" className="gap-1.5">
                        {pod.color && (
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: pod.color }}
                          />
                        )}
                        {pod.name}
                      </Badge>
                    )
                    : null;
                })
              : null
          }
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{event.title}</h1>
          {isCoach && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 mt-1"
              onClick={openEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Event
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left col */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-medium">{format(new Date(event.startTime), "EEEE, MMMM d, yyyy")}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(event.startTime), "h:mm a")}
                    {event.endTime && ` - ${format(new Date(event.endTime), "h:mm a")}`}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-4 border-t">
                <MapPin className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">{event.locationOverride || event.trailhead?.name || "TBD"}</div>
                  {event.trailhead?.address && (
                    <div className="text-sm text-muted-foreground">{event.trailhead.address}</div>
                  )}
                  {mapUrl && (
                    <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" asChild>
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                        <Map className="h-4 w-4 mr-2" /> Open in Google Maps
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              {event.description && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-2">Details</h3>
                  <div className="text-sm prose dark:prose-invert max-w-none">
                    {event.description}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {event.attachments && event.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Files & Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {event.attachments.map(att => (
                    <a key={att.id} href={`/api/storage${att.objectPath}`} target="_blank" rel="noopener noreferrer"
                       className="flex items-center p-3 rounded-lg border hover:bg-muted transition-colors">
                      <FileText className="h-5 w-5 mr-3 text-muted-foreground" />
                      <span className="font-medium text-sm">{att.label}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Your RSVP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button
                  variant={event.myRsvp === "attending" ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => handleRsvp("attending")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "attending" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Going
                </Button>
                <Button
                  variant={event.myRsvp === "not_attending" ? "destructive" : "outline"}
                  className="w-full justify-start"
                  onClick={() => handleRsvp("not_attending")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "not_attending" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Not Going
                </Button>
                <Button
                  variant={event.myRsvp === "maybe" ? "secondary" : "outline"}
                  className="w-full justify-start"
                  onClick={() => handleRsvp("maybe")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "maybe" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Maybe
                </Button>
              </div>

              <div className="mt-6 pt-4 border-t border-border/50 text-sm flex justify-between text-muted-foreground">
                <span>{event.rsvpCounts.attending} Going</span>
                <span>{event.rsvpCounts.maybe} Maybe</span>
                <span>{event.rsvpCounts.notAttending} Not</span>
              </div>
            </CardContent>
          </Card>

          {["practice", "race", "social"].includes(event.eventType) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Logistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {["practice", "race"].includes(event.eventType) && (
                  <Link href={`/carpools/${event.id}`}>
                    <Button variant="outline" className="w-full justify-between group">
                      <div className="flex items-center">
                        <Car className="h-4 w-4 mr-2 text-muted-foreground" />
                        Carpools
                      </div>
                      <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {event.carpoolSpotsAvailable > 0 ? `${event.carpoolSpotsAvailable} spots` : 'View'}
                      </span>
                    </Button>
                  </Link>
                )}

                {["race", "social"].includes(event.eventType) && showVolunteerSection && (
                  <Button
                    variant="outline"
                    className="w-full justify-between group"
                    onClick={() => document.getElementById("volunteer-tasks-section")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                      Volunteers
                      {!volunteerTasksEnabled && isCoach && (
                        <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>
                      )}
                    </div>
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                      {event.volunteerCount} signed up
                    </span>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── VOLUNTEER TASKS SECTION ──────────────────────────────────────────── */}
      {showVolunteerSection && (
        <div id="volunteer-tasks-section" className="space-y-4 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Volunteer Tasks
                {volunteerTasksEnabled && (tasks ?? []).length > 0 && (
                  <Badge variant="secondary" className="text-xs ml-1">{(tasks ?? []).length} task{(tasks ?? []).length !== 1 ? "s" : ""}</Badge>
                )}
              </h2>
              {!volunteerTasksEnabled && isCoach && (
                <p className="text-sm text-muted-foreground mt-0.5">Enable to let families sign up for volunteer tasks at this event.</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {isCoach && volunteerTasksEnabled && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowTemplateSelector(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add from Templates
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddTask(true)}>
                    <Plus className="h-3.5 w-3.5" /> Custom Task
                  </Button>
                </>
              )}
              {isCoach && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{volunteerTasksEnabled ? "Enabled" : "Disabled"}</span>
                  <Switch
                    checked={volunteerTasksEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={setEnabledMut.isPending}
                  />
                </div>
              )}
            </div>
          </div>

          {volunteerTasksEnabled && (
            (tasks ?? []).length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No volunteer tasks yet.{isCoach ? " Add tasks from templates or create a custom one." : ""}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {categories.map((category) => {
                  const catTasks = tasksByCategory[category] ?? [];
                  const isExpanded = expandedCategories.has(category);
                  const catFilled = catTasks.reduce((sum, t) => sum + (t.signups?.length ?? 0), 0);
                  const catTotal = catTasks.reduce((sum, t) => sum + t.slotsNeeded, 0);
                  const myCountInCat = catTasks.filter(t => t.mySignup).length;

                  return (
                    <Card key={category} className="overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
                        onClick={() => toggleCategory(category)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm">{category}</span>
                          <span className="text-xs text-muted-foreground">{catFilled}/{catTotal} slots filled</span>
                          {myCountInCat > 0 && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5 text-primary">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" /> You're on it
                            </Badge>
                          )}
                        </div>
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                      </button>

                      {isExpanded && (
                        <div className="divide-y divide-border border-t">
                          {catTasks.map((task) => {
                            const filled = task.signups?.length ?? 0;
                            const pct = task.slotsNeeded > 0 ? Math.min(100, Math.round((filled / task.slotsNeeded) * 100)) : 100;
                            const isFull = filled >= task.slotsNeeded;
                            const mySignup = task.mySignup;

                            return (
                              <div key={task.id} className="px-5 py-4 flex items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{task.title}</span>
                                    {mySignup && (
                                      <Badge variant="secondary" className="text-xs py-0 px-1.5 text-primary shrink-0">
                                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" /> You're in
                                      </Badge>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                                  )}
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 max-w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${isFull ? "bg-green-500" : "bg-primary"}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0">{filled}/{task.slotsNeeded}</span>
                                  </div>
                                  {(task.signups ?? []).length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {task.signups!.map(s => (
                                        <span key={s.id} className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                                          {s.user?.firstName} {s.user?.lastName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                  {mySignup ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => handleCancel(task.id)}
                                      disabled={cancelMut.isPending}
                                    >
                                      Cancel
                                    </Button>
                                  ) : (
                                    <Button
                                      variant={isFull ? "secondary" : "outline"}
                                      size="sm"
                                      onClick={() => handleSignUp(task.id)}
                                      disabled={signUpMut.isPending || isFull}
                                    >
                                      {isFull ? "Full" : "Sign Up"}
                                    </Button>
                                  )}
                                  {isCoach && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => handleDeleteTask(task.id)}
                                      disabled={deleteTaskMut.isPending}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* ─── EDIT EVENT DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Title *</Label>
              <Input value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} placeholder="Event title" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g. Early season skills — bring snacks" rows={3} className="resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Type *</Label>
              <Select value={editData.eventType} onValueChange={v => setEditData(p => ({ ...p, eventType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date *</Label>
              <Input type="date" value={editData.startDate} onChange={e => setEditData(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Start time *</Label>
              <Input type="time" value={editData.startTime} onChange={e => setEditData(p => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">End time <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="time" value={editData.endTime} onChange={e => setEditData(p => ({ ...p, endTime: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Trailhead <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={editData.trailheadId || "_none"} onValueChange={v => setEditData(p => ({ ...p, trailheadId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(trailheads ?? []).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label className="text-sm">Pod assignment</Label>
              <div className="flex items-center gap-2">
                <input id="edit-event-all-team" type="checkbox" checked={editData.isAllTeam}
                  onChange={e => setEditData(p => ({ ...p, isAllTeam: e.target.checked, podId: "" }))}
                  className="h-4 w-4 rounded border-input accent-primary" />
                <label htmlFor="edit-event-all-team" className="text-sm cursor-pointer select-none">All Team</label>
              </div>
              {!editData.isAllTeam && (
                <Select value={editData.podId || "_none"} onValueChange={v => setEditData(p => ({ ...p, podId: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a pod..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— select a pod —</SelectItem>
                    {(pods ?? []).map(pod => <SelectItem key={pod.id} value={String(pod.id)}>{pod.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleSave} disabled={updateEvent.isPending}>
              {updateEvent.isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setShowEdit(false)} disabled={updateEvent.isPending}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── ADD FROM TEMPLATES DIALOG ─────────────────────────────────────────── */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tasks from Templates</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1 mb-3">Select tasks to add to this event.</p>
          {templateCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No templates. Add them in Admin → Volunteer Templates.</p>
          ) : (
            <div className="space-y-4">
              {templateCategories.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {(templatesByCategory[cat] ?? []).map(tpl => (
                      <label key={tpl.id} className="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-primary"
                          checked={selectedTplIds.has(tpl.id)}
                          onChange={e => {
                            setSelectedTplIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(tpl.id); else next.delete(tpl.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{tpl.title}</div>
                          {tpl.description && <div className="text-xs text-muted-foreground">{tpl.description}</div>}
                          <div className="text-xs text-muted-foreground">{tpl.slotsDefault} slot{tpl.slotsDefault !== 1 ? "s" : ""} needed</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-3 border-t mt-3">
            <Button className="flex-1" onClick={handleAddFromTemplates}
              disabled={selectedTplIds.size === 0 || addFromTemplatesMut.isPending}>
              {addFromTemplatesMut.isPending ? "Adding..." : `Add ${selectedTplIds.size > 0 ? selectedTplIds.size + " " : ""}Task${selectedTplIds.size !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="outline" onClick={() => { setShowTemplateSelector(false); setSelectedTplIds(new Set()); }}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── ADD CUSTOM TASK DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Category *</Label>
              <Input placeholder="e.g. Race Day" value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Title *</Label>
              <Input placeholder="e.g. Course Marshal" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea placeholder="Optional notes" value={newTask.description}
                onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} rows={2} className="resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Slots needed</Label>
              <Input type="number" min={1} value={newTask.slotsNeeded}
                onChange={e => setNewTask(p => ({ ...p, slotsNeeded: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleCreateTask} disabled={createTaskMut.isPending}>
              {createTaskMut.isPending ? "Adding..." : "Add Task"}
            </Button>
            <Button variant="outline" onClick={() => setShowAddTask(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
