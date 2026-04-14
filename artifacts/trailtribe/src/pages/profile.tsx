import {
  useGetMe, useUpdateMe, useGetHousehold, useUpdateHousehold, useUpdateHouseholdCompliance,
  getGetHouseholdQueryKey,
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
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { UserCircle, Home, Bike, ClipboardCheck, Link2, Plus, Trash2, Pencil, CheckCircle2, Copy, Check, LogOut, Users, Bell } from "lucide-react";
import { format } from "date-fns";

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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<string | null>(null);

  const prefs: UserNotificationPreferences = { ...DEFAULT_PREFS, ...(user.notificationPreferences ?? {}) };
  const masterOn: boolean = user.notificationsEnabled ?? true;
  const hasPhone = !!user.phone;
  const isCoachOrAdmin = user.role === "coach" || user.role === "admin";

  const save = async (patch: Record<string, any>, key: string) => {
    setSavingKey(key);
    try {
      const res = await fetch(`${BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setRecentlySaved(key);
        setTimeout(() => setRecentlySaved(null), 2000);
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
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
            value={user.emailNotifications ?? true}
            disabled={!masterOn}
            onChange={(v) => save({ emailNotifications: v }, "emailNotifications")}
          />
          <ToggleRow
            toggleKey="smsNotifications"
            label="SMS text messages"
            description={hasPhone ? "Get urgent updates as a text." : "Add a phone number in My Account to enable SMS."}
            value={user.smsNotifications ?? false}
            disabled={!masterOn || !hasPhone}
            onChange={(v) => save({ smsNotifications: v }, "smsNotifications")}
          />
          <ToggleRow
            toggleKey="pushNotifications"
            label="In-app notifications"
            description="See a badge when something needs your attention."
            value={user.pushNotifications ?? true}
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
    const res = await fetch(url, {
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
      const res = await fetch(`${BASE_URL}/api/users/me/household`, {
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
      const res = await fetch(`${BASE_URL}/api/users/me/join`, {
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

function MyFamilyTab({ householdId }: { householdId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
    fetch(`${BASE_URL}/api/team-documents`)
      .then(r => r.ok ? r.json() : [])
      .then(setTeamDocs)
      .catch(() => {});
  }, []);

  const fetchRiders = async () => {
    const res = await fetch(`${BASE_URL}/api/households/${householdId}/riders`);
    if (res.ok) setRiders(await res.json());
  };

  useEffect(() => { fetchRiders(); }, [householdId]);

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
    const res = await fetch(`${BASE_URL}/api/households/${householdId}/riders/${riderId}`, { method: "DELETE" });
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

  const { signOut } = useClerk();

  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and your family.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="account" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <UserCircle className="h-4 w-4" /> My Account
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="family" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Home className="h-4 w-4" /> My Family
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
      </Tabs>
    </div>
  );
}
