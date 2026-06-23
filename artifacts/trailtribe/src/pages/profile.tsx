import {
  useGetMe, useUpdateMe, useGetHousehold, useUpdateHousehold, useUpdateHouseholdCompliance,
  getGetHouseholdQueryKey, useGetCalendarSubscribeUrl, getGetCalendarSubscribeUrlQueryKey, useRegenerateCalendarToken,
  useGetMyVolunteerSignups, useListEvents, useListEventTasks, useBulkSignupForEventTasks,
  getListEventTasksQueryKey,
} from "@workspace/api-client-react";
import type { User, UserNotificationPreferences } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { UserCircle, Home, Bike, ClipboardCheck, Link2, Plus, Trash2, Pencil, CheckCircle2, Copy, Check, LogOut, Users, Bell, Car, Rss, ExternalLink, RefreshCw, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

const profileSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
});

const householdSchema = z.object({
  name: z.string().min(2),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

const riderSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  grade: z.coerce.number().int().min(5).max(12).optional(),
  allergies: z.string().optional(),
  medicalNotes: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  emailNotifications: z.boolean().optional(),
  notifPracticeReminders: z.boolean().optional(),
  notifCoachMessages: z.boolean().optional(),
  notifEventReminders: z.boolean().optional(),
});

type RiderFormValues = z.infer<typeof riderSchema>;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const DEFAULT_PREFS: UserNotificationPreferences = {
  practiceReminders: true,
  coachMessages: true,
  carpoolUpdates: true,
  eventReminders: true,
  rosterUpdates: true,
};



function NotificationsTab({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<string | null>(null);

  // Optimistic local state so toggles never snap back while the server round-trips
  const [localUser, setLocalUser] = useState<User>(user);
  useEffect(() => { setLocalUser(user); }, [user]);

  const prefs: UserNotificationPreferences = { ...DEFAULT_PREFS, ...(localUser.notificationPreferences ?? {}) };
  const masterOn: boolean = localUser.notificationsEnabled ?? true;
  const hasPhone = !!localUser.phone;
  const isCoachOrAdmin = localUser.role === "coach" || localUser.role === "admin";

  const save = async (patch: Record<string, any>, key: string) => {
    // Optimistically apply the patch to local state immediately
    setLocalUser(prev => ({ ...prev, ...patch }));
    setSavingKey(key);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setRecentlySaved(key);
        setTimeout(() => setRecentlySaved(null), 2000);
      } else {
        // Roll back optimistic update on failure
        setLocalUser(user);
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      setLocalUser(user);
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const ToggleRow = ({
    toggleKey, label, description, value, disabled, onChange,
  }: {
    toggleKey: string; label: string; description: string;
    value: boolean; disabled?: boolean; onChange: (v: boolean) => void;
  }) => (
    <div className={`flex items-center justify-between rounded-lg border p-4 transition-opacity ${disabled ? "opacity-50" : ""}`}>
      <div className="space-y-0.5 flex-1 mr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        {recentlySaved === toggleKey && (
          <span className="text-xs text-green-500 font-medium">Saved</span>
        )}
        <Switch
          checked={value}
          onCheckedChange={disabled ? undefined : onChange}
          disabled={disabled || savingKey === toggleKey}
        />
      </div>
    </div>
  );

  const topics = [
    { key: "practiceReminders", label: "Practice & training reminders", desc: "Reminders before scheduled practices and workouts." },
    { key: "coachMessages", label: "Coach announcements", desc: "Messages and updates sent by coaches." },
    { key: "carpoolUpdates", label: "Carpool updates", desc: "New ride offers, ride requests, and matches." },
    { key: "eventReminders", label: "Event reminders & changes", desc: "Race schedule updates and day-before reminders." },
    ...(isCoachOrAdmin ? [{ key: "rosterUpdates", label: "Roster updates", desc: "New families pending approval and roster changes." }] : []),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
          <CardDescription>Control when and how TrailTribe contacts you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            toggleKey="notificationsEnabled"
            label="Receive notifications"
            description="Master switch — turn off to silence all notifications."
            value={masterOn}
            onChange={(v) => save({ notificationsEnabled: v }, "notificationsEnabled")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>How you want to be reached.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            toggleKey="emailNotifications"
            label="Email"
            description="Get event updates and messages in your inbox."
            value={localUser.emailNotifications ?? true}
            disabled={!masterOn}
            onChange={(v) => save({ emailNotifications: v }, "emailNotifications")}
          />
          <ToggleRow
            toggleKey="smsNotifications"
            label="SMS text messages"
            description={hasPhone ? "Get urgent updates as a text." : "Add a phone number in My Account to enable SMS."}
            value={localUser.smsNotifications ?? false}
            disabled={!masterOn || !hasPhone}
            onChange={(v) => save({ smsNotifications: v }, "smsNotifications")}
          />
          <ToggleRow
            toggleKey="pushNotifications"
            label="In-app notifications"
            description="See a badge when something needs your attention."
            value={localUser.pushNotifications ?? true}
            disabled={!masterOn}
            onChange={(v) => save({ pushNotifications: v }, "pushNotifications")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Topics</CardTitle>
          <CardDescription>What you want to hear about.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map(({ key, label, desc }) => (
            <ToggleRow
              key={key}
              toggleKey={key}
              label={label}
              description={desc}
              value={prefs[key as keyof UserNotificationPreferences] ?? true}
              disabled={!masterOn}
              onChange={(v) => save({ notificationPreferences: { ...prefs, [key]: v } }, key)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}



function RiderDialog({
  householdId,
  rider,
  onClose,
  onSaved,
}: {
  householdId: number;
  rider?: {
    id: number; firstName: string; lastName: string;
    grade?: number | null; allergies?: string | null; medicalNotes?: string | null;
    email?: string | null; emailNotifications?: boolean | null;
    notificationPreferences?: {
      practiceReminders?: boolean; coachMessages?: boolean; eventReminders?: boolean;
    } | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();
  const riderEmail = rider?.email?.endsWith("@trailtribe.internal") ? "" : (rider?.email ?? "");
  const riderPrefs = rider?.notificationPreferences ?? {};

  const form = useForm<RiderFormValues>({
    resolver: zodResolver(riderSchema),
    defaultValues: {
      firstName: rider?.firstName ?? "",
      lastName: rider?.lastName ?? "",
      grade: rider?.grade ?? undefined,
      allergies: rider?.allergies ?? "",
      medicalNotes: rider?.medicalNotes ?? "",
      email: riderEmail,
      emailNotifications: rider?.emailNotifications ?? false,
      notifPracticeReminders: riderPrefs.practiceReminders ?? true,
      notifCoachMessages: riderPrefs.coachMessages ?? true,
      notifEventReminders: riderPrefs.eventReminders ?? true,
    },
  });

  const emailOn = form.watch("emailNotifications");

  const onSubmit = async (values: RiderFormValues) => {
    const { notifPracticeReminders, notifCoachMessages, notifEventReminders, ...rest } = values;
    const body = {
      ...rest,
      notificationPreferences: {
        practiceReminders: notifPracticeReminders ?? true,
        coachMessages: notifCoachMessages ?? true,
        eventReminders: notifEventReminders ?? true,
      },
    };
    const url = rider
      ? `${BASE_URL}/api/households/${householdId}/riders/${rider.id}`
      : `${BASE_URL}/api/households/${householdId}/riders`;
    const method = rider ? "PATCH" : "POST";
    const res = await authedFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast({ title: "Failed to save rider", variant: "destructive" });
      return;
    }
    toast({ title: rider ? "Rider updated" : "Rider added" });
    onSaved();
    onClose();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="firstName" render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="lastName" render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="grade" render={({ field }) => (
          <FormItem>
            <FormLabel>Grade (5–12)</FormLabel>
            <FormControl><Input type="number" min={5} max={12} {...field} value={field.value ?? ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="allergies" render={({ field }) => (
          <FormItem>
            <FormLabel>Allergies</FormLabel>
            <FormControl><Input placeholder="e.g. peanuts, bees" {...field} /></FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="medicalNotes" render={({ field }) => (
          <FormItem>
            <FormLabel>Medical Notes</FormLabel>
            <FormControl><Input placeholder="e.g. carries EpiPen" {...field} /></FormControl>
          </FormItem>
        )} />

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Notifications</p>
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Rider Email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl><Input type="email" placeholder="rider@example.com" {...field} /></FormControl>
              <FormDescription className="text-xs">If provided, the rider can receive their own team notifications.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="emailNotifications" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="text-sm font-medium">Email notifications</FormLabel>
                <FormDescription className="text-xs">Send team updates to this rider's email.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )} />

          {/* Per-topic toggles — only relevant when email is on */}
          <div className={`space-y-2 pl-2 border-l-2 border-muted transition-opacity ${emailOn ? "" : "opacity-40 pointer-events-none"}`}>
            <p className="text-xs text-muted-foreground">Which topics should this rider receive?</p>
            {[
              { name: "notifPracticeReminders" as const, label: "Practice & training reminders" },
              { name: "notifCoachMessages" as const, label: "Coach announcements" },
              { name: "notifEventReminders" as const, label: "Event reminders & changes" },
            ].map(({ name, label }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="text-sm font-normal cursor-pointer">{label}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} disabled={!emailOn} />
                  </FormControl>
                </FormItem>
              )} />
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : rider ? "Save Changes" : "Add Rider"}
        </Button>
      </form>
    </Form>
  );
}



const createHouseholdSchema = z.object({
  name: z.string().min(2, "Family name must be at least 2 characters"),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

const joinSchema = z.object({
  inviteCode: z.string().min(6, "Enter a valid invite code"),
});

function NoHouseholdSetup({ userId, onCreated }: { userId?: number; onCreated: () => void }) {
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createForm = useForm<z.infer<typeof createHouseholdSchema>>({
    resolver: zodResolver(createHouseholdSchema),
    defaultValues: { name: "", emergencyContactName: "", emergencyContactPhone: "" },
  });

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { inviteCode: "" },
  });

  const handleCreate = async (values: z.infer<typeof createHouseholdSchema>) => {
    setIsSubmitting(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me/household`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? "Failed to create household", variant: "destructive" });
        return;
      }
      toast({ title: "Household created! Welcome to TrailTribe." });
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (values: z.infer<typeof joinSchema>) => {
    setIsSubmitting(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: values.inviteCode.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? "Invalid invite code", variant: "destructive" });
        return;
      }
      toast({ title: "You've joined the household!" });
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === "create") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setMode("choose")} className="text-muted-foreground">← Back</Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5" /> Set Up Your Family</CardTitle>
            <CardDescription>This creates a household for your family. You can add riders and documents right after.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Family Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="e.g. Garcia Family" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                  <FormField control={createForm.control} name="emergencyContactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Name</FormLabel>
                      <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="emergencyContactPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Phone</FormLabel>
                      <FormControl><Input type="tel" placeholder="(555) 000-0000" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Household"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setMode("choose")} className="text-muted-foreground">← Back</Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Join a Household</CardTitle>
            <CardDescription>Another family member already set up your household and shared an invite code with you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...joinForm}>
              <form onSubmit={joinForm.handleSubmit(handleJoin)} className="space-y-4">
                <FormField control={joinForm.control} name="inviteCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invite Code</FormLabel>
                    <FormControl><Input placeholder="e.g. a3f9c2b1" className="font-mono" {...field} /></FormControl>
                    <FormMessage />
                    <FormDescription>You can find this code in the invite link your co-parent sent you.</FormDescription>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Joining..." : "Join Household"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-10 text-center">
          <Home className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
          <h3 className="text-lg font-semibold">Set up your family</h3>
          <p className="text-muted-foreground max-w-sm mt-2 text-sm">
            Create a household for your family, or join one if another parent already set it up.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full max-w-xs">
            <Button className="flex-1" onClick={() => setMode("create")}>
              <Plus className="h-4 w-4 mr-2" /> Create Household
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setMode("join")}>
              <Users className="h-4 w-4 mr-2" /> Join with Code
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



interface TeamDoc { type: string; viewUrl: string | null; }

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

function CrossEventSignupPanel({ events }: { events: any[] }) {
  const [attendedIds, setAttendedIds] = useState<Set<number>>(new Set());
  const [tasksByEvent, setTasksByEvent] = useState<Map<number, any[]>>(new Map());
  const bulkSignup = useBulkSignupForEventTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTasksLoaded = useCallback((eventId: number, tasks: any[]) => {
    setTasksByEvent(prev => {
      const next = new Map(prev);
      next.set(eventId, tasks);
      return next;
    });
  }, []);

  const toggleAttended = (eventId: number) => {
    setAttendedIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
      return next;
    });
  };

  const taskGroups = useMemo(() => {
    const map = new Map<string, { eventId: number; taskId: number; eventTitle: string }[]>();
    for (const eventId of attendedIds) {
      const tasks = tasksByEvent.get(eventId) ?? [];
      const event = events.find((e: any) => e.id === eventId);
      for (const task of tasks) {
        if (task.mySignup) continue;
        const filled = task.signups?.length ?? 0;
        if (filled >= task.slotsNeeded) continue;
        if (!map.has(task.title)) map.set(task.title, []);
        map.get(task.title)!.push({ eventId, taskId: task.id, eventTitle: event?.title ?? "" });
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [attendedIds, tasksByEvent, events]);

  const applyTask = (title: string, occurrences: { eventId: number; taskId: number }[]) => {
    Promise.all(
      occurrences.map(({ eventId, taskId }) =>
        bulkSignup.mutateAsync({ id: eventId, data: { taskIds: [taskId] } }).catch(() => null)
      )
    ).then(() => {
      const n = occurrences.length;
      toast({ title: `Signed up for "${title}" at ${n} event${n !== 1 ? "s" : ""}` });
      occurrences.forEach(({ eventId }) =>
        queryClient.invalidateQueries({ queryKey: getListEventTasksQueryKey(eventId) })
      );
    });
  };

  if (events.length < 2) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Apply to Multiple Events</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Check the events you're attending, then sign up for recurring tasks across all of them at once.
        </p>
      </div>

      <div className="space-y-1.5">
        {events.map((e: any) => (
          <label key={e.id} className="flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded border hover:bg-muted/30">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary shrink-0"
              checked={attendedIds.has(e.id)}
              onChange={() => toggleAttended(e.id)}
            />
            <span className="text-sm flex-1">{e.title}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(e.startTime), "MMM d")}</span>
          </label>
        ))}
      </div>

      {[...attendedIds].map(id => (
        <EventTaskLoader key={id} eventId={id} onLoad={handleTasksLoaded} />
      ))}

      {attendedIds.size > 0 && taskGroups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Open tasks at your attended events
          </h3>
          {taskGroups.map(([title, occurrences]) => (
            <div key={title} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {occurrences.length === 1
                    ? occurrences[0].eventTitle
                    : `${occurrences.length} events`}
                </div>
              </div>
              <Button
                size="sm"
                variant={occurrences.length > 1 ? "default" : "outline"}
                onClick={() => applyTask(title, occurrences)}
                disabled={bulkSignup.isPending}
                className="shrink-0"
              >
                {occurrences.length > 1 ? `Sign up at all ${occurrences.length}` : "Sign up"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {attendedIds.size > 0 && taskGroups.length === 0 && [...attendedIds].every(id => tasksByEvent.has(id)) && (
        <p className="text-sm text-muted-foreground text-center py-3">No open tasks at your selected events.</p>
      )}
    </div>
  );
}

function VolunteerOpportunityCard({ event }: { event: { id: number; title: string; startTime: string } }) {
  const { data: tasks } = useListEventTasks(event.id, {
    query: { enabled: true, queryKey: getListEventTasksQueryKey(event.id) }
  });
  const bulkSignup = useBulkSignupForEventTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const openTasks = (tasks ?? []).filter((t: any) => {
    const filled = t.signups?.length ?? 0;
    return !t.mySignup && filled < t.slotsNeeded;
  });

  if (openTasks.length === 0) return null;

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleApply = () => {
    if (selected.size === 0) return;
    bulkSignup.mutate(
      { id: event.id, data: { taskIds: [...selected] } },
      {
        onSuccess: (result: any) => {
          const added = result?.added ?? selected.size;
          toast({ title: `Signed up for ${added} task${added !== 1 ? "s" : ""} at ${event.title}` });
          setSelected(new Set());
          queryClient.invalidateQueries({ queryKey: getListEventTasksQueryKey(event.id) });
        },
        onError: () => toast({ title: "Sign-up failed", variant: "destructive" }),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">{event.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(event.startTime), "EEE, MMM d")}</p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">{openTasks.length} open</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {openTasks.map((task: any) => (
          <label key={task.id} className="flex items-center gap-2.5 cursor-pointer py-1 rounded hover:bg-muted/40 px-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary shrink-0"
              checked={selected.has(task.id)}
              onChange={() => toggle(task.id)}
            />
            <span className="text-sm flex-1">{task.title}</span>
            {task.category && <Badge variant="secondary" className="text-xs py-0 px-1.5">{task.category}</Badge>}
          </label>
        ))}
        <Button
          size="sm"
          className="w-full mt-2"
          onClick={handleApply}
          disabled={selected.size === 0 || bulkSignup.isPending}
        >
          {bulkSignup.isPending ? "Signing up…" : `Sign Up${selected.size > 0 ? ` for ${selected.size}` : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function VolunteerCommitmentsTab() {
  const { data: signups, isLoading } = useGetMyVolunteerSignups();
  const { data: allEvents } = useListEvents();
  const now = new Date();

  const upcoming = (signups ?? []).filter(s => {
    const eventStart = s.event?.startTime ? new Date(s.event.startTime) : null;
    return eventStart && eventStart >= now;
  });
  const past = (signups ?? []).filter(s => {
    const eventStart = s.event?.startTime ? new Date(s.event.startTime) : null;
    return eventStart && eventStart < now;
  });

  const signedUpEventIds = new Set((signups ?? []).map(s => s.event?.id).filter(Boolean));
  const opportunities = (allEvents ?? []).filter((e: any) => {
    if (!e.volunteerTasksEnabled) return false;
    const start = new Date(e.startTime);
    return start >= now && !signedUpEventIds.has(e.id);
  }).slice(0, 8);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading commitments…</div>;
  }

  const renderGroup = (items: typeof signups, label: string) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        {items.map(s => {
          const eventStart = s.event?.startTime ? new Date(s.event.startTime) : null;
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-start gap-3">
                <ClipboardCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{s.task?.title ?? "Unknown task"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.event?.title ?? "Unknown event"}
                    {eventStart && (
                      <> · {format(eventStart, "EEE, MMM d")}</>
                    )}
                  </div>
                  {s.task?.category && (
                    <Badge variant="secondary" className="mt-1.5 text-xs py-0 px-1.5">{s.task.category}</Badge>
                  )}
                </div>
                {s.event?.id && (
                  <a
                    href={`/events/${s.event.id}`}
                    className="text-xs text-primary hover:underline shrink-0 mt-0.5 font-medium"
                  >
                    View
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const hasContent = (signups ?? []).length > 0 || opportunities.length > 0;

  if (!hasContent) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No volunteer activity yet</p>
          <p className="text-xs mt-1">Visit an event page to sign up for volunteer tasks.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {opportunities.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Volunteer Opportunities</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Upcoming events with open tasks — select and sign up in one click.</p>
          </div>
          {opportunities.map((e: any) => (
            <VolunteerOpportunityCard key={e.id} event={e} />
          ))}
        </div>
      )}
      <CrossEventSignupPanel events={opportunities} />
      {(signups ?? []).length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">My Commitments</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Events you've signed up to help at.</p>
          </div>
          {renderGroup(upcoming, `Upcoming (${upcoming.length})`)}
          {renderGroup(past, `Past (${past.length})`)}
        </div>
      )}
    </div>
  );
}

function MyFamilyTab({ householdId }: { householdId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();
  const { data: household, isLoading } = useGetHousehold(householdId, {
    query: { queryKey: getGetHouseholdQueryKey(householdId) },
  });
  const updateHousehold = useUpdateHousehold();
  const updateCompliance = useUpdateHouseholdCompliance();

  const [riders, setRiders] = useState<any[]>([]);
  const [riderDialogOpen, setRiderDialogOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamDocs, setTeamDocs] = useState<TeamDoc[]>([]);

  useEffect(() => {
    authedFetch(`${BASE_URL}/api/team-documents`)
      .then(r => r.ok ? r.json() : [])
      .then(setTeamDocs)
      .catch(() => {});
  }, [authedFetch]);

  const fetchRiders = async () => {
    const res = await authedFetch(`${BASE_URL}/api/households/${householdId}/riders`);
    if (res.ok) setRiders(await res.json());
  };

  useEffect(() => { fetchRiders(); }, [householdId, authedFetch]);

  const householdForm = useForm<z.infer<typeof householdSchema>>({
    resolver: zodResolver(householdSchema),
    defaultValues: { name: "", emergencyContactName: "", emergencyContactPhone: "" },
  });

  useEffect(() => {
    if (household) {
      householdForm.reset({
        name: household.name,
        emergencyContactName: household.emergencyContactName ?? "",
        emergencyContactPhone: household.emergencyContactPhone ?? "",
      });
    }
  }, [household]);

  const saveHousehold = (values: z.infer<typeof householdSchema>) => {
    updateHousehold.mutate({ id: householdId, data: values }, {
      onSuccess: () => {
        toast({ title: "Family info saved" });
        queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey(householdId) });
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const toggleCompliance = (field: "liabilityWaiverSigned" | "mediaReleaseSigned" | "codeOfConductSigned", val: boolean) => {
    updateCompliance.mutate({ id: householdId, data: { [field]: val } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey(householdId) }),
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };

  const deleteRider = async (riderId: number) => {
    const res = await authedFetch(`${BASE_URL}/api/households/${householdId}/riders/${riderId}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "Rider removed" }); fetchRiders(); }
    else toast({ title: "Failed to remove rider", variant: "destructive" });
  };

  const inviteUrl = household
    ? `${window.location.origin}${BASE_URL}/join/${household.inviteCode}`
    : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return <div className="p-4 text-center text-muted-foreground">Loading family info...</div>;
  if (!household) return <div className="p-4 text-center text-destructive">Could not load household.</div>;

  const docUrlByType = Object.fromEntries(teamDocs.map(d => [d.type, d.viewUrl]));

  const complianceDocs = [
    { key: "liabilityWaiverSigned" as const, label: "Liability Waiver", date: household.liabilityWaiverSignedAt, docType: "liability_waiver" },
    { key: "mediaReleaseSigned" as const, label: "Media Release", date: household.mediaReleaseSignedAt, docType: "media_release" },
    { key: "codeOfConductSigned" as const, label: "Code of Conduct", date: household.codeOfConductSignedAt, docType: "code_of_conduct" },
  ];

  return (
    <div className="space-y-6">
      <Form {...householdForm}>
        <form onSubmit={householdForm.handleSubmit(saveHousehold)}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5" /> Family Info</CardTitle>
              {household.podId && (
                <div className="mt-1">
                  <Badge variant="secondary" className="text-xs">Pod: {household.podId}</Badge>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={householdForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Family Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Garcia Family" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                <FormField control={householdForm.control} name="emergencyContactName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Name</FormLabel>
                    <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={householdForm.control} name="emergencyContactPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Phone</FormLabel>
                    <FormControl><Input type="tel" placeholder="(555) 000-0000" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={updateHousehold.isPending}>
                  {updateHousehold.isPending ? "Saving..." : "Save Family Info"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      {/* Riders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5" /> Riders</CardTitle>
            <CardDescription className="mt-1">Students registered under this household.</CardDescription>
          </div>
          <Dialog open={riderDialogOpen && !editingRider} onOpenChange={(o) => { setRiderDialogOpen(o); if (!o) setEditingRider(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setEditingRider(null)}>
                <Plus className="h-4 w-4 mr-1" /> Add Rider
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add a Rider</DialogTitle></DialogHeader>
              <RiderDialog householdId={householdId} onClose={() => setRiderDialogOpen(false)} onSaved={fetchRiders} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {riders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bike className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No riders added yet. Add your kids to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {riders.map(rider => (
                <div key={rider.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="font-medium">{rider.firstName} {rider.lastName}</div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-0.5">
                      {rider.grade && <span>Grade {rider.grade}</span>}
                      {rider.allergies && <span className="text-amber-600 dark:text-amber-500">⚠ {rider.allergies}</span>}
                      {rider.email && !rider.email.endsWith("@trailtribe.internal") && (
                        <span className="text-xs text-primary/70">{rider.email}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={riderDialogOpen && editingRider?.id === rider.id} onOpenChange={(o) => { setRiderDialogOpen(o); if (!o) setEditingRider(null); }}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRider(rider)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Edit Rider</DialogTitle></DialogHeader>
                        <RiderDialog householdId={householdId} rider={rider} onClose={() => { setRiderDialogOpen(false); setEditingRider(null); }} onSaved={fetchRiders} />
                      </DialogContent>
                    </Dialog>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteRider(rider.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Family Members */}
      {(() => {
        const adults = (household as any).members?.filter((m: any) => m.role !== "student") ?? [];
        return (
          <>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Family Members</CardTitle>
                  <CardDescription className="mt-1">Adults who have access to this household.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 ml-4" onClick={() => setInviteOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Parent
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {adults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
                ) : (
                  adults.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {m.firstName} {m.lastName}
                          {m.role === "coach" && <Badge variant="secondary" className="text-xs">Coach</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {m.email && !m.email.endsWith("@trailtribe.internal") ? m.email : ""}
                          {m.phone && <span className="ml-2">{m.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {m.emailNotifications && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">Email</span>}
                        {m.smsNotifications && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">SMS</span>}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Invite a Co-Parent</DialogTitle>
                  <DialogDescription>Share this link so another parent can join your household and see the same events and notifications.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                  <div className="flex gap-2">
                    <Input value={inviteUrl} readOnly className="font-mono text-xs bg-muted" />
                    <Button variant="outline" size="icon" onClick={copyInvite} className="shrink-0">
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code: <span className="font-mono font-medium">{household.inviteCode}</span>
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}

      {/* Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Season Documents</CardTitle>
          <CardDescription>Required forms for participation. Check each once signed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {complianceDocs.map(({ key, label, date, docType }) => {
            const viewUrl = docUrlByType[docType];
            return (
              <div key={key} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-medium flex items-center gap-2">
                      {household[key] && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {label}
                    </div>
                    {date && (
                      <p className="text-xs text-muted-foreground">
                        Signed {format(new Date(date), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={household[key]}
                    onCheckedChange={(val) => toggleCompliance(key, val)}
                    disabled={updateCompliance.isPending}
                  />
                </div>
                {viewUrl && (
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <Link2 className="h-3 w-3" /> View document before signing
                  </a>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}



export default function Profile() {
  const { data: user, isLoading } = useGetMe();
  const updateMutation = useUpdateMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: "", lastName: "", phone: "" },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || "",
      });
    }
  }, [user, form]);

  const onSubmit = (values: z.infer<typeof profileSchema>) => {
    updateMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => {
        toast({ title: "Error updating profile", variant: "destructive" });
      }
    });
  };

  const [defaultSeats, setDefaultSeats] = useState<string>("");
  const [defaultTrays, setDefaultTrays] = useState<string>("");
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  const [calCopied, setCalCopied] = useState<"webcal" | "https" | null>(null);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const { data: calSubscribeData, isLoading: calSubscribeLoading } = useGetCalendarSubscribeUrl({ query: { enabled: !!user, queryKey: getGetCalendarSubscribeUrlQueryKey() } });
  const regenMutation = useRegenerateCalendarToken();

  const copyCalUrl = async (text: string, which: "webcal" | "https" = "webcal") => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCalCopied(which);
    setTimeout(() => setCalCopied(null), 2000);
  };

  const handleRegenerate = () => {
    regenMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCalendarSubscribeUrlQueryKey() });
        toast({ title: "Calendar link regenerated", description: "Your old link will no longer sync. New link is ready." });
        setRegenConfirmOpen(false);
      },
      onError: () => {
        toast({ title: "Failed to regenerate link", variant: "destructive" });
        setRegenConfirmOpen(false);
      },
    });
  };

  useEffect(() => {
    if (user) {
      setDefaultSeats(user.defaultCarpoolSeats != null ? String(user.defaultCarpoolSeats) : "");
      setDefaultTrays(user.defaultCarpoolTrays != null ? String(user.defaultCarpoolTrays) : "");
    }
  }, [user]);

  const saveCarpoolDefaults = async () => {
    setIsSavingDefaults(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCarpoolSeats: defaultSeats !== "" ? Number(defaultSeats) : null,
          defaultCarpoolTrays: defaultTrays !== "" ? Number(defaultTrays) : null,
        }),
      });
      if (res.ok) {
        toast({ title: "Carpool defaults saved" });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const { signOut } = useClerk();

  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and your family.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="account" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <UserCircle className="h-4 w-4" /> My Account
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="family" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Home className="h-4 w-4" /> My Family
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ClipboardCheck className="h-4 w-4" /> Volunteer
          </TabsTrigger>
        </TabsList>

        {/* My Account tab */}
        <TabsContent value="account" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl><Input type="tel" placeholder="(555) 000-0000" {...field} /></FormControl>
                      <FormDescription className="text-xs">Required to enable SMS notifications.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="pt-2">
                    <Label>Email</Label>
                    <Input value={user?.email} disabled className="mt-1 bg-muted text-muted-foreground" />
                    <p className="text-xs text-muted-foreground mt-1">Email is managed by your sign-in provider.</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Car className="h-5 w-5" /> Carpool Defaults</CardTitle>
              <CardDescription>Set your usual capacity once — it pre-fills the offer form and is used when you quickly claim a rider. Changes save automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default-seats">Seats I can offer</Label>
                  <Input
                    id="default-seats"
                    type="number"
                    min="1"
                    max="8"
                    placeholder="e.g. 2"
                    value={defaultSeats}
                    onChange={e => setDefaultSeats(e.target.value)}
                    onBlur={saveCarpoolDefaults}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-trays">Bike spots I can offer</Label>
                  <Input
                    id="default-trays"
                    type="number"
                    min="0"
                    max="6"
                    placeholder="e.g. 1"
                    value={defaultTrays}
                    onChange={e => setDefaultTrays(e.target.value)}
                    onBlur={saveCarpoolDefaults}
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">Leave blank if you don't usually drive.</p>
                {isSavingDefaults && <span className="text-xs text-muted-foreground">Saving...</span>}
              </div>
            </CardContent>
          </Card>

          {user && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Rss className="h-5 w-5" /> Calendar Feed</CardTitle>
                <CardDescription>Subscribe to your personal team calendar in Google Calendar, Apple Calendar, or Outlook. Events stay automatically in sync.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {calSubscribeLoading ? (
                  <div className="text-sm text-muted-foreground py-2">Loading your calendar link...</div>
                ) : calSubscribeData ? (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">One-click subscribe</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 truncate font-mono">
                          {calSubscribeData.subscribeUrl}
                        </code>
                        <Button size="icon" variant="outline" onClick={() => copyCalUrl(calSubscribeData.subscribeUrl, "webcal")} title="Copy webcal link">
                          {calCopied === "webcal" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="outline" asChild title="Open in calendar app">
                          <a href={calSubscribeData.subscribeUrl}><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      </div>
                      <a
                        href={calSubscribeData.httpsUrl}
                        download="trailtribe-team.ics"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                      >
                        <Download className="h-3 w-3" /> Download .ics file instead
                      </a>
                    </div>
                    <div className="pt-3 border-t flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Rotate this link if it was shared accidentally — old subscriptions stop syncing immediately.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setRegenConfirmOpen(true)}
                        disabled={regenMutation.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Regenerate link
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-destructive py-2">Failed to load calendar link. Try again later.</div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="pt-4 border-t mt-4">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </TabsContent>

        {/* Notifications tab */}
        <TabsContent value="notifications" className="mt-6">
          {user ? <NotificationsTab user={user} /> : null}
        </TabsContent>

        {/* My Family tab */}
        <TabsContent value="family" className="mt-6">
          {user?.householdId ? (
            <MyFamilyTab householdId={user.householdId} />
          ) : (
            <NoHouseholdSetup userId={user?.id} onCreated={() => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })} />
          )}
        </TabsContent>

        {/* Volunteer Commitments tab */}
        <TabsContent value="volunteer" className="mt-6">
          <VolunteerCommitmentsTab />
        </TabsContent>
      </Tabs>

      <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate calendar link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new personal feed URL. Anyone subscribed to your old link will stop receiving updates — they'll need the new link to stay in sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={regenMutation.isPending}>
              {regenMutation.isPending ? "Regenerating..." : "Yes, regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
