import {
  useGetEvent, useUpdateEvent, useGetMe, useListTrailheads, useListPods,
  useListEventTasks, useSignUpForEventTask, useCancelEventTaskSignup,
  useSetEventVolunteerTasksEnabled, useCreateEventTask, useDeleteEventTask, useUpdateEventTask,
  useCloneEventTasksFromTemplate, useListVolunteerTemplateTasks, useRemoveEventTaskSignup,
  useReorderEventTasks,
  getListEventTasksQueryKey, getListVolunteerTemplateTasksQueryKey,
  useListBoardThreads, useListBoardPosts, useCreateBoardThread,
  getListBoardPostsQueryKey, getListBoardThreadsQueryKey,
  useListEventRsvps, getListEventRsvpsQueryKey
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { MapPin, Calendar as CalendarIcon, Users, Car, FileText, ChevronLeft, Map, Pencil, CheckCircle2, Plus, Trash2, ChevronDown, ChevronUp, X, AlertTriangle, MessageSquare, Bike, UserRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatEventType } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEventQueryKey, getListEventsQueryKey, UpdateEventBodyEventType } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { LoadErrorCard } from "@/components/network-status";
import { EventDetailSkeleton } from "@/components/route-skeletons";
import { useRoutePerformance } from "@/lib/route-performance";
import {
  getVolunteerTaskState,
  volunteerTaskAvailableButtonClassName,
  volunteerTaskUnavailableButtonClassName,
} from "@/lib/volunteer-task-status";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const EVENT_TYPES = Object.values(UpdateEventBodyEventType) as string[];

function EventDiscussion({ eventId, eventTitle }: { eventId: number; eventTitle: string }) {
  const { data: threads, isLoading, isError, refetch } = useListBoardThreads({ scope: "event", eventId });
  const thread = threads?.[0];
  const createThread = useCreateBoardThread();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: posts } = useListBoardPosts(thread?.id ?? 0, {
    query: { enabled: !!thread?.id, queryKey: getListBoardPostsQueryKey(thread?.id ?? 0) }
  });

  const handleCreateDiscussion = () => {
    createThread.mutate({
      data: {
        title: `Discussion: ${eventTitle}`,
        body: `Use this thread to coordinate for ${eventTitle} — meet-up spots, ride shares, questions, or anything else.`,
        eventId,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Discussion started" });
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
        refetch();
      },
      onError: () => {
        toast({ title: "Couldn't start the discussion", description: "Please check your access and try again.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-[#0a0c10] shadow-cel-sm mt-8 bg-card" data-testid={`event-discussion-loading-${eventId}`}>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading discussion…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-2 border-destructive/60 bg-destructive/10 mt-8" data-testid={`event-discussion-error-${eventId}`}>
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">Couldn't load the discussion</p>
            <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!thread) {
    return (
      <Card className="border-2 border-[#0a0c10] shadow-cel-sm mt-8 bg-card" data-testid={`event-discussion-empty-${eventId}`}>
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <div className="h-11 w-11 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">No discussion yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start a conversation about meet-up spots, ride shares, or event questions.
            </p>
          </div>
          <Button
            onClick={handleCreateDiscussion}
            disabled={createThread.isPending}
            className="cel-interactive border-2 border-[#0a0c10]"
          >
            {createThread.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Start the Discussion
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Keep the preview stable even if the API response order changes. The full
  // thread remains available through the link below, including after the
  // board-wide 36-hour visibility window has elapsed.
  const recentPosts = [...(posts ?? [])]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-3);

  return (
    <Card
      className="border-2 border-[#0a0c10] shadow-cel-sm mt-8 bg-card"
      data-testid={`event-discussion-preview-${eventId}`}
    >
      <CardHeader className="pb-3 border-b-2 border-[#0a0c10] bg-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Event Discussion
          </CardTitle>
          <Badge variant="secondary" className="font-bold">{thread.replyCount} replies</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y-2 divide-[#0a0c10]/10">
          {recentPosts.length > 0 ? (
            recentPosts.map((post) => (
              <div key={post.id} className="p-4 flex gap-3 hover:bg-muted/30 transition-colors">
                <div className="h-8 w-8 rounded-full bg-secondary border border-[#0a0c10] flex items-center justify-center font-bold text-xs shrink-0">
                  {post.author ? (post.author.firstName[0] + post.author.lastName[0]) : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sm text-foreground">
                      {post.author ? `${post.author.firstName} ${post.author.lastName}` : "Unknown"}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-1">
                    {post.isDeleted ? <span className="italic">[deleted]</span> : post.body}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground font-medium">
              No replies yet. Be the first to start the conversation!
            </div>
          )}
        </div>
        <div className="p-4 bg-muted/30 border-t-2 border-[#0a0c10]">
          <Button asChild className="w-full cel-interactive border-2 border-[#0a0c10]">
            <Link href={`/messages/thread/${thread.id}?tab=events`} data-testid="event-discussion-thread-link">
              Join the Discussion
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EventDetail() {
  const params = useParams();
  const eventId = parseInt(params.id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: event, isLoading, isError, error, refetch } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) }
  });
  useRoutePerformance("event-detail", event !== undefined, event !== undefined && !isLoading);
  const { data: me } = useGetMe();
  const { data: trailheads } = useListTrailheads();
  const { data: pods } = useListPods();
  const updateEvent = useUpdateEvent();

  const isCoach = me?.role === "coach" || me?.role === "admin";
  const isAdmin = me?.role === "admin";

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
  const authedFetch = useAuthedFetch();

  const setEnabledMut = useSetEventVolunteerTasksEnabled();
  const signUpMut = useSignUpForEventTask();
  const cancelMut = useCancelEventTaskSignup();
  const createTaskMut = useCreateEventTask();
  const deleteTaskMut = useDeleteEventTask();
  const updateTaskMut = useUpdateEventTask();
  const addFromTemplatesMut = useCloneEventTasksFromTemplate();
  const removeSignupMut = useRemoveEventTaskSignup();
  const reorderTasksMut = useReorderEventTasks();

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTplIds, setSelectedTplIds] = useState<Set<number>>(new Set());
  const [packs, setPacks] = useState<any[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsLoadError, setPacksLoadError] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [showEditTasks, setShowEditTasks] = useState(false);
  const [editTasksChecked, setEditTasksChecked] = useState<Set<number>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ category: "", title: "", description: "", slotsNeeded: 1 });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ category: "", title: "", description: "", slotsNeeded: 1 });
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const attendStorageKey = `trailtribe:attending:${eventId}`;
  const [isAttending, setIsAttendingState] = useState(() => {
    try { return sessionStorage.getItem(`trailtribe:attending:${eventId}`) === "true"; } catch { return false; }
  });
  const setIsAttending = (val: boolean) => {
    try { sessionStorage.setItem(attendStorageKey, String(val)); } catch {}
    setIsAttendingState(val);
  };

  useEffect(() => {
    if (!isCoach) return;
    let active = true;
    setPacksLoading(true);
    setPacksLoadError(false);
    authedFetch(`${BASE_URL}/api/volunteer-tasks/packs`)
      .then(async response => {
        if (response.status === 304) return null;
        if (!response.ok) throw new Error("Failed to load volunteer task packs");
        return response.json();
      })
      .then(data => {
        if (active && data !== null) setPacks(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) {
          setPacks([]);
          setPacksLoadError(true);
        }
      })
      .finally(() => {
        if (active) setPacksLoading(false);
      });
    return () => { active = false; };
  }, [authedFetch, isCoach]);

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

  const handleRemoveSignup = (taskId: number, signupId: number) => {
    removeSignupMut.mutate({ id: eventId, taskId, signupId }, {
      onSuccess: () => { invalidateTasks(); toast({ title: "Signup removed" }); },
      onError: () => toast({ title: "Failed to remove signup", variant: "destructive" }),
    });
  };

  const handleDeleteTask = (taskId: number) => {
    deleteTaskMut.mutate({ id: eventId, taskId }, {
      onSuccess: () => invalidateTasks(),
      onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
    });
  };

  const handleEditTaskOpen = (task: any) => {
    setEditingTaskId(task.id);
    setEditTaskForm({ category: task.category, title: task.title, description: task.description ?? "", slotsNeeded: task.slotsNeeded });
  };

  const handleEditTaskSave = () => {
    if (!editingTaskId) return;
    updateTaskMut.mutate(
      { id: eventId, taskId: editingTaskId, data: editTaskForm },
      {
        onSuccess: () => { setEditingTaskId(null); invalidateTasks(); toast({ title: "Task updated" }); },
        onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
      }
    );
  };

  const handleMoveTask = (taskId: number, direction: "up" | "down") => {
    const taskIndex = (tasks ?? []).findIndex(task => task.id === taskId);
    const nextIndex = direction === "up" ? taskIndex - 1 : taskIndex + 1;
    if (taskIndex < 0 || nextIndex < 0 || nextIndex >= (tasks ?? []).length || reorderTasksMut.isPending) return;

    const orderedTaskIds = (tasks ?? []).map(task => task.id);
    [orderedTaskIds[taskIndex], orderedTaskIds[nextIndex]] = [orderedTaskIds[nextIndex], orderedTaskIds[taskIndex]];
    reorderTasksMut.mutate(
      { id: eventId, data: { orderedTaskIds } },
      {
        onSuccess: () => {
          invalidateTasks();
          toast({ title: "Task order updated" });
        },
        onError: () => toast({ title: "Failed to reorder tasks", variant: "destructive" }),
      },
    );
  };

  const handleAddFromTemplates = () => {
    if (addableSelectedTplIds.length === 0) return;
    addFromTemplatesMut.mutate(
      { id: eventId, data: { templateTaskIds: addableSelectedTplIds } },
      {
        onSuccess: (data) => {
          toast({ title: `${data.added} task${data.added !== 1 ? "s" : ""} added` });
          setShowTemplateSelector(false);
          resetTemplateSelection();
          invalidateTasks();
        },
        onError: () => toast({ title: "Failed to add tasks", variant: "destructive" }),
      }
    );
  };

  const resetTemplateSelection = () => {
    setSelectedPackId(null);
    setSelectedTplIds(new Set());
  };

  const existingTemplateIds = new Set(
    (tasks ?? [])
      .map(task => task.templateTaskId)
      .filter((templateTaskId): templateTaskId is number => typeof templateTaskId === "number"),
  );
  const addableSelectedTplIds = [...selectedTplIds].filter(id => !existingTemplateIds.has(id));

  const handleTemplatePackChange = (value: string) => {
    if (value === "_none") {
      setSelectedPackId(null);
      setSelectedTplIds(new Set());
      return;
    }
    const packId = Number(value);
    const pack = packs.find(p => p.id === packId);
    setSelectedPackId(packId);
    setSelectedTplIds(new Set(
      (pack?.tasks ?? [])
        .map((task: any) => task.id)
        .filter((id: number) => !existingTemplateIds.has(id)),
    ));
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
  const categories = Object.keys(tasksByCategory).sort((a, b) => {
    const firstTaskA = tasksByCategory[a]?.[0];
    const firstTaskB = tasksByCategory[b]?.[0];
    return (firstTaskA?.sortOrder ?? 0) - (firstTaskB?.sortOrder ?? 0) || a.localeCompare(b);
  });

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
      podId: (event.podIds && event.podIds.length > 0) ? String(event.podIds[0]) : "",
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

  // ─── ATTENDEE LIST (coaches only) ──────────────────────────────────────────
  const { data: eventRsvps } = useListEventRsvps(eventId, {
    query: { enabled: isCoach && !!eventId, queryKey: getListEventRsvpsQueryKey(eventId) }
  });

  // ─── RSVP STATE ────────────────────────────────────────────────────────────
  const isParent = me?.role === "parent";
  const isStudent = me?.role === "student";
  const [householdRiders, setHouseholdRiders] = useState<{ id: number; firstName: string }[]>([]);
  const [ridersLoaded, setRidersLoaded] = useState(false);
  const [memberStatuses, setMemberStatuses] = useState<Record<number, string | null>>({});
  const [savingFor, setSavingFor] = useState<number | null>(null); // -1 = all members

  useEffect(() => {
    if (!me) return;
    if (!(me as any)?.householdId) {
      // No household — nothing to fetch; mark loaded so the UI is not stuck in skeleton
      setRidersLoaded(true);
      return;
    }
    authedFetch(`${BASE_URL}/api/households/${(me as any).householdId}/riders`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setHouseholdRiders(data ?? []); setRidersLoaded(true); })
      .catch(() => setRidersLoaded(true));
  }, [(me as any)?.householdId, !!me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync member statuses from server whenever the event data refreshes
  useEffect(() => {
    if (!event) return;
    const serverStatuses = (event as any).householdMemberRsvps as Record<number, string | null> | undefined;
    if (serverStatuses && Object.keys(serverStatuses).length > 0) {
      setMemberStatuses(serverStatuses);
    }
  }, [event]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parents: riders only (parent attendance doesn't matter to the team).
  // Coaches/admins: self first, then riders (coach headcount matters).
  const allMembers: { id: number; name: string; isRider: boolean }[] = (() => {
    if (!me) return [];
    const riders = householdRiders.map((r) => ({ id: r.id, name: r.firstName, isRider: true }));
    if (isParent) return riders;
    if (isCoach) return [
      { id: (me as any).id, name: me.firstName ?? "You", isRider: false },
      ...riders,
    ];
    if (isStudent) return [{ id: (me as any).id, name: me.firstName ?? "You", isRider: true }];
    return [];
  })();

  const handleMemberRsvp = async (memberId: number, status: "attending" | "not_attending" | "maybe") => {
    const prev = memberStatuses[memberId] ?? null;
    setMemberStatuses(s => ({ ...s, [memberId]: status }));
    setSavingFor(memberId);
    try {
      const res = await authedFetch(`${BASE_URL}/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, userIds: [memberId] }),
      });
      if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    } catch {
      setMemberStatuses(s => ({ ...s, [memberId]: prev }));
      toast({ title: "Failed to update RSVP", variant: "destructive" });
    } finally {
      setSavingFor(null);
    }
  };

  const setAllGoing = async () => {
    if (allMembers.length === 0) return;
    const prevStatuses = { ...memberStatuses };
    setMemberStatuses(s => ({ ...s, ...Object.fromEntries(allMembers.map(m => [m.id, "attending"])) }));
    setSavingFor(-1);
    try {
      const res = await authedFetch(`${BASE_URL}/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "attending", userIds: allMembers.map(m => m.id) }),
      });
      if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    } catch {
      setMemberStatuses(prevStatuses);
      toast({ title: "Failed to update RSVP", variant: "destructive" });
    } finally {
      setSavingFor(null);
    }
  };

  if (isLoading) return <EventDetailSkeleton />;

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto pt-4 md:pt-8 px-6 md:px-8">
        <LoadErrorCard feature="this event" error={error} onRetry={() => { void refetch(); }} />
      </div>
    );
  }

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
              ? [...new Set(event.podIds)].map(pid => {
                  const pod = (pods ?? []).find(p => String(p.id) === String(pid));
                  return pod
                    ? (
                      <Badge key={pid} variant="outline" className="gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: pod.color ?? "#94a3b8" }}
                        />
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
              {/* ── Per-member RSVP rows ─────────────────────────────────── */}
              {!ridersLoaded ? (
                <div className="space-y-2">
                  {[0, 1].map(i => (
                    <div key={i} className="h-9 bg-muted/50 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : isParent && allMembers.length === 0 ? (
                <div className="py-4 text-center space-y-2">
                  <Bike className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Add riders to your household to track event attendance.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/profile">Manage Household</a>
                  </Button>
                </div>
              ) : allMembers.length > 0 ? (
                <div className="space-y-1">
                  {/* "Everyone's going" shortcut — only when no statuses set yet */}
                  {allMembers.every(m => !memberStatuses[m.id]) && (
                    <Button
                      variant="default"
                      className="w-full gap-2 mb-3"
                      onClick={setAllGoing}
                      disabled={savingFor === -1}
                    >
                      {savingFor === -1
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4" />
                      }
                      {allMembers.length === 1 ? "I'm going" : "Everyone's going"}
                    </Button>
                  )}

                  {allMembers.map(member => {
                    const status = memberStatuses[member.id] ?? null;
                    const isSaving = savingFor === member.id;
                    return (
                      <div key={member.id} className="flex items-center gap-2 py-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {member.isRider
                            ? <Bike className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className="text-sm truncate">{member.name}</span>
                          {!member.isRider && (
                            <span className="text-xs text-muted-foreground shrink-0">(you)</span>
                          )}
                        </div>
                        {/* Inline 3-segment toggle */}
                        <div className="flex rounded-md border border-border overflow-hidden shrink-0 text-xs font-semibold">
                          {([
                            { value: "attending" as const, label: "✓", title: "Going" },
                            { value: "maybe" as const, label: "?", title: "Maybe" },
                            { value: "not_attending" as const, label: "✕", title: "Not going" },
                          ] as const).map(({ value, label, title }) => (
                            <button
                              key={value}
                              title={title}
                              disabled={isSaving || savingFor === -1}
                              onClick={() => { if (status !== value) handleMemberRsvp(member.id, value); }}
                              className={cn(
                                "px-2.5 py-1.5 transition-colors border-r last:border-r-0 border-border",
                                status === value
                                  ? value === "attending"
                                    ? "bg-primary text-primary-foreground"
                                    : value === "not_attending"
                                      ? "bg-destructive/80 text-destructive-foreground"
                                      : "bg-secondary text-secondary-foreground"
                                  : "bg-background text-muted-foreground hover:bg-muted/70 cursor-pointer"
                              )}
                            >
                              {isSaving ? "·" : label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* ── Attendance counts ──────────────────────────────────── */}
              <div className="mt-6 pt-4 border-t border-border/50 text-sm text-muted-foreground space-y-1.5">
                {(event.rsvpCounts as any).coachesGoing !== undefined ? (
                  <>
                    {(event.rsvpCounts as any).coachesGoing + (event.rsvpCounts as any).ridersGoing > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground/70">Going</span>
                        <span>
                          {(event.rsvpCounts as any).coachesGoing} coach{(event.rsvpCounts as any).coachesGoing !== 1 ? "es" : ""}
                          {" · "}
                          {(event.rsvpCounts as any).ridersGoing} rider{(event.rsvpCounts as any).ridersGoing !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {(event.rsvpCounts as any).coachesMaybe + (event.rsvpCounts as any).ridersMaybe > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground/70">Maybe</span>
                        <span>
                          {(event.rsvpCounts as any).coachesMaybe} coach{(event.rsvpCounts as any).coachesMaybe !== 1 ? "es" : ""}
                          {" · "}
                          {(event.rsvpCounts as any).ridersMaybe} rider{(event.rsvpCounts as any).ridersMaybe !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {(event.rsvpCounts as any).coachesNotAttending + (event.rsvpCounts as any).ridersNotAttending > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground/70">Not going</span>
                        <span>
                          {(event.rsvpCounts as any).coachesNotAttending} coach{(event.rsvpCounts as any).coachesNotAttending !== 1 ? "es" : ""}
                          {" · "}
                          {(event.rsvpCounts as any).ridersNotAttending} rider{(event.rsvpCounts as any).ridersNotAttending !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>{event.rsvpCounts.attending} Going</span>
                    <span>{event.rsvpCounts.maybe} Maybe</span>
                    <span>{event.rsvpCounts.notAttending} Not</span>
                  </div>
                )}
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
                    </div>
                    {volunteerTasksEnabled ? (
                      <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                        {event.volunteerCount} signed up
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">Disabled</span>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── ATTENDEES SECTION (coaches/admins only) ──────────────────────────── */}
      {isCoach && (
        <div className="pt-2">
          <button
            className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-[#0a0c10] bg-card shadow-cel-sm hover:bg-muted/50 transition-colors"
            onClick={() => setAttendeesOpen((o) => !o)}
          >
            <span className="flex items-center gap-2 font-bold text-base">
              <Users className="h-5 w-5 text-primary" />
              Attendees
              {eventRsvps && (
                <Badge variant="secondary" className="text-xs font-bold">
                  {eventRsvps.filter((r) => r.status === "attending").length} going
                  {eventRsvps.filter((r) => r.status === "maybe").length > 0
                    ? ` · ${eventRsvps.filter((r) => r.status === "maybe").length} maybe`
                    : ""}
                </Badge>
              )}
            </span>
            {attendeesOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>

          {attendeesOpen && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Going group */}
              <Card className="border-2 border-[#0a0c10] shadow-cel-sm">
                <CardHeader className="pb-2 border-b border-[#0a0c10]/10">
                  <CardTitle className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Going
                    <span className="ml-auto text-muted-foreground font-normal">
                      {(eventRsvps ?? []).filter((r) => r.status === "attending").length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(eventRsvps ?? []).filter((r) => r.status === "attending").length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No one yet</p>
                  ) : (
                    <ul className="divide-y divide-[#0a0c10]/10">
                      {(eventRsvps ?? [])
                        .filter((r) => r.status === "attending")
                        .map((r) => (
                          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="h-7 w-7 rounded-full bg-secondary border border-[#0a0c10] flex items-center justify-center text-xs font-bold shrink-0">
                              {r.user ? r.user.firstName[0] + r.user.lastName[0] : "?"}
                            </div>
                            <span className="text-sm font-medium flex-1">
                              {r.user ? `${r.user.firstName} ${r.user.lastName}` : "Unknown"}
                            </span>
                            {r.user && (
                              <Badge
                                variant={r.user.role === "coach" || r.user.role === "admin" ? "default" : "outline"}
                                className="text-xs capitalize shrink-0"
                              >
                                {r.user.role}
                              </Badge>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Maybe group */}
              <Card className="border-2 border-[#0a0c10] shadow-cel-sm">
                <CardHeader className="pb-2 border-b border-[#0a0c10]/10">
                  <CardTitle className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Maybe
                    <span className="ml-auto text-muted-foreground font-normal">
                      {(eventRsvps ?? []).filter((r) => r.status === "maybe").length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(eventRsvps ?? []).filter((r) => r.status === "maybe").length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No one yet</p>
                  ) : (
                    <ul className="divide-y divide-[#0a0c10]/10">
                      {(eventRsvps ?? [])
                        .filter((r) => r.status === "maybe")
                        .map((r) => (
                          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="h-7 w-7 rounded-full bg-secondary border border-[#0a0c10] flex items-center justify-center text-xs font-bold shrink-0">
                              {r.user ? r.user.firstName[0] + r.user.lastName[0] : "?"}
                            </div>
                            <span className="text-sm font-medium flex-1">
                              {r.user ? `${r.user.firstName} ${r.user.lastName}` : "Unknown"}
                            </span>
                            {r.user && (
                              <Badge
                                variant={r.user.role === "coach" || r.user.role === "admin" ? "default" : "outline"}
                                className="text-xs capitalize shrink-0"
                              >
                                {r.user.role}
                              </Badge>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

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
              {volunteerTasksEnabled && isStudent && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  These opportunities apply to this event only. Choose a task after confirming you plan to attend.
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {isCoach && volunteerTasksEnabled && (
                <>
                  {(tasks ?? []).length > 0 && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                      setEditTasksChecked(new Set((tasks ?? []).map(t => t.id)));
                      setShowEditTasks(true);
                    }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit Tasks
                    </Button>
                  )}
                   <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                     resetTemplateSelection();
                     setShowTemplateSelector(true);
                   }}>
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

          {volunteerTasksEnabled && isCoach && (tasks ?? []).length > 0 && (() => {
            const allTasks = tasks ?? [];
            const totalSlots = allTasks.reduce((sum, t) => sum + t.slotsNeeded, 0);
            const filledSlots = allTasks.reduce((sum, t) => sum + (t.signups?.length ?? 0), 0);
            const unfilledTasks = allTasks.filter(t => (t.signups?.length ?? 0) < t.slotsNeeded);
            const pct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100;
            const allFilled = unfilledTasks.length === 0;
            return (
              <Card className={`border ${allFilled ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      {allFilled
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      }
                      <span className="text-sm font-semibold">
                        {allFilled ? "All volunteer slots filled" : `${unfilledTasks.length} task${unfilledTasks.length !== 1 ? "s" : ""} need${unfilledTasks.length === 1 ? "s" : ""} volunteers`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${allFilled ? "bg-green-500" : "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{filledSlots}/{totalSlots} slots</span>
                    </div>
                  </div>
                  {!allFilled && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unfilledTasks.map(t => (
                        <Badge key={t.id} variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                          {t.title} ({t.signups?.length ?? 0}/{t.slotsNeeded})
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {volunteerTasksEnabled && (
            <>
              {/* Step 1: Attendance checkbox — non-coaches must confirm before signing up */}
              {!isCoach && (tasks ?? []).length > 0 && (
                <Card className={`border transition-colors ${isAttending ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="attending-check"
                      checked={isAttending}
                      onChange={e => setIsAttending(e.target.checked)}
                      className="h-4 w-4 rounded accent-primary shrink-0 cursor-pointer"
                    />
                    <label htmlFor="attending-check" className="text-sm font-medium cursor-pointer select-none flex-1">
                      I'm planning to attend this event
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        Check this to see and sign up for volunteer tasks
                      </span>
                    </label>
                    {isAttending && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Task grid — visible only after attendance confirmed (or for coaches always) */}
              {(isAttending || isCoach) && (
                (tasks ?? []).length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-10 text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No volunteer tasks yet.{isAdmin ? " Add tasks from templates or create a custom one." : ""}</p>
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
                            const taskIndex = (tasks ?? []).findIndex(item => item.id === task.id);
                            const filled = task.signups?.length ?? 0;
                            const pct = task.slotsNeeded > 0 ? Math.min(100, Math.round((filled / task.slotsNeeded) * 100)) : 100;
                            const taskState = getVolunteerTaskState(task);
                            const isFull = taskState === "full";
                            const mySignup = taskState === "claimed";

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
                                        <span key={s.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                                          {s.user?.firstName} {s.user?.lastName}
                                          {isCoach && (
                                            <button
                                              type="button"
                                              className="ml-0.5 rounded-full hover:text-destructive transition-colors disabled:opacity-50"
                                              title="Remove signup"
                                              disabled={removeSignupMut.isPending}
                                              onClick={() => handleRemoveSignup(task.id, s.id)}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                  {isCoach && (
                                    <div className="flex items-center gap-0.5">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleMoveTask(task.id, "up")}
                                        disabled={taskIndex === 0 || reorderTasksMut.isPending}
                                        aria-label={`Move ${task.title} up`}
                                        title="Move up"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleMoveTask(task.id, "down")}
                                        disabled={taskIndex === (tasks ?? []).length - 1 || reorderTasksMut.isPending}
                                        aria-label={`Move ${task.title} down`}
                                        title="Move down"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  )}
                                  {mySignup ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled
                                        aria-label={`You’re on it: ${task.title}`}
                                        className={volunteerTaskUnavailableButtonClassName}
                                      >
                                        You’re on it
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => handleCancel(task.id)}
                                        disabled={cancelMut.isPending}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handleSignUp(task.id)}
                                      disabled={signUpMut.isPending || isFull}
                                      aria-label={isFull ? `Full: ${task.title}` : `Sign up for ${task.title}`}
                                      className={isFull ? volunteerTaskUnavailableButtonClassName : volunteerTaskAvailableButtonClassName}
                                    >
                                      {isFull ? "Full" : "Sign Up"}
                                    </Button>
                                  )}
                                  {isCoach && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleEditTaskOpen(task)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
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
            </>
          )}
        </div>
      )}

      {/* ─── EVENT DISCUSSION ──────────────────────────────────────────────────── */}
      <EventDiscussion eventId={eventId} eventTitle={event.title} />

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
                <SelectTrigger><SelectValue>{formatEventType(editData.eventType)}</SelectValue></SelectTrigger>
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
      <Dialog open={showTemplateSelector} onOpenChange={open => {
        setShowTemplateSelector(open);
        if (!open) resetTemplateSelection();
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tasks from Templates</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1 mb-3">
            Choose a pack to start with, then review the tasks before adding them to this event.
          </p>
          {packsLoading ? (
            <p className="text-xs text-muted-foreground italic mb-3">Loading task packs…</p>
          ) : packsLoadError ? (
            <p className="text-xs text-destructive mb-3">
              Task packs could not be loaded. You can still select individual templates below.
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              <label htmlFor="event-template-pack" className="text-xs font-medium text-muted-foreground">
                Start with a task pack
              </label>
              <Select
                value={selectedPackId ? String(selectedPackId) : "_none"}
                onValueChange={handleTemplatePackChange}
              >
                <SelectTrigger id="event-template-pack" className="h-9 text-sm">
                  <SelectValue placeholder="— no pack —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— no pack, choose tasks manually —</SelectItem>
                  {packs.map(pack => (
                    <SelectItem key={pack.id} value={String(pack.id)}>
                      {pack.name} ({pack.tasks?.length ?? 0} tasks)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {templateCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No templates. Add them in Admin → Volunteer Templates.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {selectedPackId
                    ? `Available tasks from ${packs.find(pack => pack.id === selectedPackId)?.name ?? "this pack"} are selected by default.`
                    : "Select individual template tasks for this event."}
                </span>
                <span className="font-semibold whitespace-nowrap">
                  {addableSelectedTplIds.length} selected
                </span>
              </div>
              {existingTemplateIds.size > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  Tasks already on this event are marked below and cannot be added again.
                </p>
              )}
              {templateCategories.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {(templatesByCategory[cat] ?? []).map(tpl => (
                      <label
                        key={tpl.id}
                        className={cn(
                          "flex items-start gap-3 p-2.5 rounded-lg border transition-colors",
                          existingTemplateIds.has(tpl.id)
                            ? "bg-muted/30 opacity-70 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/50",
                        )}
                      >
                        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-primary"
                          checked={selectedTplIds.has(tpl.id)}
                          disabled={existingTemplateIds.has(tpl.id)}
                          onChange={e => {
                            setSelectedTplIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(tpl.id); else next.delete(tpl.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span>{tpl.title}</span>
                            {existingTemplateIds.has(tpl.id) && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 whitespace-nowrap">
                                Already on event
                              </Badge>
                            )}
                          </div>
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
              disabled={addableSelectedTplIds.length === 0 || addFromTemplatesMut.isPending}>
              {addFromTemplatesMut.isPending ? "Adding..." : `Add ${addableSelectedTplIds.length > 0 ? addableSelectedTplIds.length + " " : ""}Task${addableSelectedTplIds.length !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="outline" onClick={() => { setShowTemplateSelector(false); resetTemplateSelection(); }}>Cancel</Button>
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

      {/* ─── EDIT TASKS DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={showEditTasks} onOpenChange={setShowEditTasks}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task List</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">Uncheck tasks to remove them from this event.</p>
          </DialogHeader>
          <div className="space-y-1 pt-1">
            {(tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">No tasks yet.</p>
            ) : (
              (() => {
                const tasksByEditCat = (tasks ?? []).reduce<Record<string, typeof tasks>>((acc, t) => {
                  const cat = t.category ?? "Uncategorized";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat]!.push(t);
                  return acc;
                }, {});
                return Object.entries(tasksByEditCat).map(([cat, catTasks]) => (
                  <div key={cat} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2 pb-1">{cat}</p>
                    {(catTasks ?? []).map(task => (
                      <label key={task.id} className="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded accent-primary shrink-0"
                          checked={editTasksChecked.has(task.id)}
                          onChange={e => {
                            setEditTasksChecked(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(task.id); else next.delete(task.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{task.title}</div>
                          {task.description && <div className="text-xs text-muted-foreground">{task.description}</div>}
                          <div className="text-xs text-muted-foreground">{task.slotsNeeded} slot{task.slotsNeeded !== 1 ? "s" : ""} · {task.signups?.length ?? 0} signed up</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ));
              })()
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t mt-2">
            <Button
              className="flex-1"
              disabled={deleteTaskMut.isPending}
              onClick={async () => {
                const toDelete = (tasks ?? []).filter(t => !editTasksChecked.has(t.id));
                for (const t of toDelete) {
                  await new Promise<void>((resolve, reject) =>
                    deleteTaskMut.mutate({ id: eventId, taskId: t.id }, { onSuccess: () => resolve(), onError: () => reject() })
                  );
                }
                invalidateTasks();
                setShowEditTasks(false);
                if (toDelete.length > 0) toast({ title: `${toDelete.length} task${toDelete.length !== 1 ? "s" : ""} removed` });
              }}
            >
              {deleteTaskMut.isPending ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setShowEditTasks(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingTaskId !== null} onOpenChange={(open) => { if (!open) setEditingTaskId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={editTaskForm.title}
                onChange={e => setEditTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Task title"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editTaskForm.description}
                onChange={e => setEditTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max volunteers</Label>
              <Input
                type="number"
                min={1}
                value={editTaskForm.slotsNeeded}
                onChange={e => setEditTaskForm(f => ({ ...f, slotsNeeded: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={handleEditTaskSave}
                disabled={!editTaskForm.title || updateTaskMut.isPending}
              >
                {updateTaskMut.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditingTaskId(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
