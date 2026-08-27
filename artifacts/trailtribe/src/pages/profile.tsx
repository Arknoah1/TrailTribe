import {
  useGetMe, useUpdateMe, useGetHousehold, useUpdateHousehold,
  getGetHouseholdQueryKey, useGetCalendarSubscribeUrl, getGetCalendarSubscribeUrlQueryKey, useRegenerateCalendarToken,
  useSendCoParentInvite,
} from "@workspace/api-client-react";
import type { User, UserNotificationPreferences } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatPhone, formatPhoneInput } from "@/lib/utils";
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
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { UserCircle, Home, Bike, ClipboardCheck, Link2, Plus, Trash2, Pencil, CheckCircle2, Copy, Check, LogOut, Users, Bell, Car, Rss, ExternalLink, RefreshCw, ShieldCheck, AlertTriangle, UserPlus, Lock } from "lucide-react";
import { useAdminView } from "@/hooks/use-admin-view";
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
import { DocumentConsentModal } from "@/components/document-consent-modal";
import { LoadErrorCard, LoadingState } from "@/components/network-status";
import { ProfileSkeleton } from "@/components/route-skeletons";
import { useRoutePerformance } from "@/lib/route-performance";

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

const coParentInviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
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
  notificationPreferencesLocked: z.boolean().optional(),
});

type RiderFormValues = z.infer<typeof riderSchema>;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const DEFAULT_PREFS: UserNotificationPreferences = {
  practiceReminders: true,
  coachMessages: true,
  carpoolUpdates: true,
  eventReminders: true,
  rosterUpdates: true,
  boardReplies: true,
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
  const prefsLocked = localUser.role === "student" && !!(localUser as any).notificationPreferencesLocked;

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
    { key: "boardReplies", label: "Board replies", desc: "Get notified when someone replies to a thread you're in." },
    { key: "carpoolUpdates", label: "Carpool updates", desc: "New ride offers, ride requests, and matches." },
    { key: "eventReminders", label: "Event reminders & changes", desc: "Race schedule updates and day-before reminders." },
    ...(isCoachOrAdmin ? [{ key: "rosterUpdates", label: "Roster updates", desc: "New families pending approval and roster changes." }] : []),
  ];

  return (
    <div className="space-y-6">
      {prefsLocked && (
        <div className="flex items-start gap-3 rounded-lg border border-muted bg-muted/40 px-4 py-3">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Your parent manages these notification settings. Contact them if you'd like to make changes.
          </p>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
          <CardDescription>Control when and how TrailTeam contacts you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            toggleKey="notificationsEnabled"
            label="Receive notifications"
            description="Master switch — turn off to silence all notifications."
            value={masterOn}
            disabled={prefsLocked}
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
            disabled={!masterOn || prefsLocked}
            onChange={(v) => save({ emailNotifications: v }, "emailNotifications")}
          />
          <ToggleRow
            toggleKey="smsNotifications"
            label="SMS text messages"
            description="SMS notifications are not yet available."
            value={false}
            disabled={true}
            onChange={() => {}}
          />
          <ToggleRow
            toggleKey="pushNotifications"
            label="In-app notifications"
            description="See a badge when something needs your attention."
            value={localUser.pushNotifications ?? true}
            disabled={!masterOn || prefsLocked}
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
              disabled={!masterOn || prefsLocked}
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
    notificationPreferencesLocked?: boolean | null;
    hasAppAccess?: boolean;
    notificationPreferences?: {
      practiceReminders?: boolean; coachMessages?: boolean; eventReminders?: boolean;
    } | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();
  const riderEmail = rider?.email?.endsWith("@trailteam.internal") ? "" : (rider?.email ?? "");
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
      notificationPreferencesLocked: rider?.notificationPreferencesLocked ?? false,
    },
  });

  const emailOn = form.watch("emailNotifications");

  const onSubmit = async (values: RiderFormValues) => {
    const { notifPracticeReminders, notifCoachMessages, notifEventReminders, notificationPreferencesLocked, ...rest } = values;
    const body = {
      ...rest,
      notificationPreferences: {
        practiceReminders: notifPracticeReminders ?? true,
        coachMessages: notifCoachMessages ?? true,
        eventReminders: notifEventReminders ?? true,
      },
      notificationPreferencesLocked: notificationPreferencesLocked ?? false,
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

        <div className="border-t pt-4">
          <FormField control={form.control} name="notificationPreferencesLocked" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Parent controls notification settings
                </FormLabel>
                <FormDescription className="text-xs">When on, the rider cannot change their own notification preferences.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )} />
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
      toast({ title: "Household created! Welcome to TrailTeam." });
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




function MyFamilyTab({ householdId, currentUserId, canInviteCoParent, readOnly = false }: {
  householdId: number;
  currentUserId: number;
  canInviteCoParent: boolean;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();
  const { data: household, isLoading, isError: householdError, error: householdLoadError, refetch: refetchHousehold } = useGetHousehold(householdId, {
    query: { queryKey: getGetHouseholdQueryKey(householdId) },
  });
  const updateHousehold = useUpdateHousehold();
  const sendCoParentInvite = useSendCoParentInvite();
  // updateCompliance retained for compatibility; signing now goes through DocumentConsentModal

  const [riders, setRiders] = useState<any[]>([]);
  const [riderDialogOpen, setRiderDialogOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [coParentEmail, setCoParentEmail] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<any | null>(null);
  const [sendingInviteForRider, setSendingInviteForRider] = useState<number | null>(null);
  const [consentModal, setConsentModal] = useState<{
    docType: "liability_waiver" | "media_release" | "code_of_conduct";
    label: string;
    viewUrl: string | null;
    readOnly: boolean;
  } | null>(null);

  interface ComplianceStatusItem {
    documentType: "liability_waiver" | "media_release" | "code_of_conduct";
    label: string;
    viewUrl: string | null;
    versionNumber: number | null;
    isSigned: boolean;
    signedAt: string | null;
  }
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatusItem[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [complianceError, setComplianceError] = useState<unknown>(null);
  const [ridersLoading, setRidersLoading] = useState(true);
  const [ridersError, setRidersError] = useState<unknown>(null);

  const fetchComplianceStatus = async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const response = await authedFetch(`${BASE_URL}/api/households/${householdId}/compliance/status`);
      if (!response.ok) throw Object.assign(new Error("Failed to load documents"), { status: response.status });
      setComplianceStatus(await response.json());
    } catch (error) {
      setComplianceError(error);
    } finally {
      setComplianceLoading(false);
    }
  };

  useEffect(() => { fetchComplianceStatus(); }, [householdId, authedFetch]);


  const fetchRiders = async () => {
    setRidersLoading(true);
    setRidersError(null);
    try {
      const response = await authedFetch(`${BASE_URL}/api/households/${householdId}/riders`);
      if (!response.ok) throw Object.assign(new Error("Failed to load riders"), { status: response.status });
      setRiders(await response.json());
    } catch (error) {
      setRidersError(error);
    } finally {
      setRidersLoading(false);
    }
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


  const deleteRider = async (riderId: number) => {
    const res = await authedFetch(`${BASE_URL}/api/households/${householdId}/riders/${riderId}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "Rider removed" }); fetchRiders(); }
    else toast({ title: "Failed to remove rider", variant: "destructive" });
  };

  const sendRiderInvite = async (rider: any) => {
    setSendingInviteForRider(rider.id);
    try {
      const res = await authedFetch(
        `${BASE_URL}/api/households/${householdId}/riders/${rider.id}/invite`,
        { method: "POST" }
      );
      if (res.ok) {
        toast({ title: `Invite sent to ${rider.email}` });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? "Failed to send invite", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setSendingInviteForRider(null);
    }
  };

  const removeMember = async () => {
    if (!memberToRemove) return;
    const target = memberToRemove;
    setMemberToRemove(null);
    const res = await authedFetch(`${BASE_URL}/api/households/${householdId}/members/${target.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: `${target.firstName} removed from household` });
      queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey(householdId) });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: body.error ?? "Failed to remove member", variant: "destructive" });
    }
  };

  const inviteUrl = household
    ? `${window.location.origin}${BASE_URL}/join/${household.inviteCode}`
    : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendCoParentInviteEmail = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = coParentInviteSchema.safeParse({ email: coParentEmail });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0]?.message ?? "Enter a valid email address", variant: "destructive" });
      return;
    }

    sendCoParentInvite.mutate(
      { id: householdId, data: parsed.data },
      {
        onSuccess: ({ email }) => {
          setCoParentEmail("");
          toast({ title: `Invitation emailed to ${email}` });
        },
        onError: (error: any) => {
          toast({
            title: error?.data?.error ?? "We couldn't send that invitation. You can still copy the link instead.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading) return <LoadingState label="Loading family info…" />;
  if (householdError || !household) {
    return <LoadErrorCard feature="your household" error={householdLoadError} onRetry={() => { void refetchHousehold(); }} />;
  }


  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3" role="note">
          <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">Family information is view-only</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A parent or guardian manages household details, riders, invitations, and required documents.
            </p>
          </div>
        </div>
      )}
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
                  <FormControl><Input placeholder="e.g. Garcia Family" disabled={readOnly} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                <FormField control={householdForm.control} name="emergencyContactName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Name</FormLabel>
                    <FormControl><Input placeholder="Full name" disabled={readOnly} {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={householdForm.control} name="emergencyContactPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Phone</FormLabel>
                    <FormControl><Input type="tel" placeholder="(555) 000-0000" disabled={readOnly} {...field} onChange={e => field.onChange(formatPhoneInput(e.target.value))} /></FormControl>
                  </FormItem>
                )} />
              </div>
              {!readOnly && (
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={updateHousehold.isPending}>
                    {updateHousehold.isPending ? "Saving..." : "Save Family Info"}
                  </Button>
                </div>
              )}
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
            {!readOnly && (
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
            )}
        </CardHeader>
        <CardContent>
          {ridersLoading ? (
            <LoadingState label="Loading riders…" className="min-h-24 p-4" />
          ) : ridersError ? (
            <LoadErrorCard feature="your riders" error={ridersError} onRetry={() => { void fetchRiders(); }} />
          ) : riders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bike className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No riders added yet. Add your kids to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {riders.map(rider => (
                <div key={rider.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {rider.firstName} {rider.lastName}
                      {rider.hasAppAccess && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">App access</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-0.5">
                      {rider.grade && <span>Grade {rider.grade}</span>}
                      {rider.allergies && <span className="text-amber-600 dark:text-amber-500">⚠ {rider.allergies}</span>}
                      {rider.email && !rider.email.endsWith("@trailteam.internal") && (
                        <span className="text-xs text-primary/70">{rider.email}</span>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-2 items-center">
                    {!readOnly && !rider.hasAppAccess && rider.email && !rider.email.endsWith("@trailteam.internal") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={sendingInviteForRider === rider.id}
                        onClick={() => sendRiderInvite(rider)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        {sendingInviteForRider === rider.id ? "Sending…" : "Invite to app"}
                      </Button>
                    )}
                    {!readOnly && <Dialog open={riderDialogOpen && editingRider?.id === rider.id} onOpenChange={(o) => { setRiderDialogOpen(o); if (!o) setEditingRider(null); }}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRider(rider)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Edit Rider</DialogTitle></DialogHeader>
                        <RiderDialog householdId={householdId} rider={rider} onClose={() => { setRiderDialogOpen(false); setEditingRider(null); }} onSaved={fetchRiders} />
                      </DialogContent>
                    </Dialog>}
                    {!readOnly && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteRider(rider.id)} aria-label={`Remove ${rider.firstName}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
                {canInviteCoParent ? (
                  <Button size="sm" variant="outline" className="shrink-0 ml-4" onClick={() => setInviteOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add Parent
                  </Button>
                ) : !readOnly ? (
                  <p className="max-w-40 text-right text-xs text-muted-foreground">
                    Only a parent or coach in this household can invite a co-parent.
                  </p>
                ) : null}
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
                          {m.email && !m.email.endsWith("@trailteam.internal") ? m.email : ""}
                          {m.phone && <span className="ml-2">{formatPhone(m.phone)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {m.emailNotifications && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">Email</span>}
                          {m.smsNotifications && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">SMS</span>}
                        </div>
                        {!readOnly && m.id !== currentUserId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => setMemberToRemove(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <AlertDialog open={!!memberToRemove} onOpenChange={(o) => { if (!o) setMemberToRemove(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove family member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {memberToRemove?.firstName} {memberToRemove?.lastName} will be removed from your household. Their account stays intact — they can rejoin via invite link if needed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={removeMember}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog open={inviteOpen} onOpenChange={(open) => {
              setInviteOpen(open);
              if (!open) setCoParentEmail("");
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Invite a Co-Parent</DialogTitle>
                  <DialogDescription>Send a private invitation by email, or copy a link to share yourself.</DialogDescription>
                </DialogHeader>
                <div className="space-y-5 pt-1">
                  <form onSubmit={sendCoParentInviteEmail} className="space-y-2">
                    <Label htmlFor="co-parent-email">Co-parent email</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="co-parent-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="parent@example.com"
                        value={coParentEmail}
                        onChange={(event) => setCoParentEmail(event.target.value)}
                        disabled={sendCoParentInvite.isPending}
                      />
                      <Button type="submit" className="shrink-0" disabled={sendCoParentInvite.isPending}>
                        {sendCoParentInvite.isPending ? "Sending…" : "Send invite"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      They’ll receive a private link to join your household. You can send a fresh invitation to this address if needed.
                    </p>
                  </form>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Or share the household link</p>
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
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}

      {/* Compliance — driven by server-side consent records matched to current version + active season */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Season Documents</CardTitle>
          <CardDescription>
            {readOnly
              ? "Required forms for participation. You can view signed documents; a parent or guardian handles signing."
              : "Required forms for participation. Open each document to review and sign."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {complianceLoading ? (
            <LoadingState label="Loading documents…" className="min-h-24 p-4" />
          ) : complianceError ? (
            <LoadErrorCard feature="season documents" error={complianceError} onRetry={() => { void fetchComplianceStatus(); }} />
          ) : complianceStatus.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No required documents are available right now.</p>
          ) : complianceStatus.map((item) => (
            <div key={item.documentType} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {item.isSigned && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    {item.label}
                  </div>
                  {item.isSigned && item.signedAt && (
                    <p className="text-xs text-muted-foreground">
                      Signed {format(new Date(item.signedAt), "MMM d, yyyy")}
                    </p>
                  )}
                  {!item.isSigned && !item.viewUrl && (
                    <p className="text-xs text-muted-foreground">Not yet uploaded by your coach.</p>
                  )}
                </div>
                {item.isSigned ? (
                  item.viewUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConsentModal({ docType: item.documentType, label: item.label, viewUrl: item.viewUrl, readOnly: true })}
                    >
                      View Document
                    </Button>
                  ) : null
                ) : readOnly ? (
                  <span className="text-xs text-muted-foreground text-right max-w-32">Ask a parent or guardian to sign</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={!item.viewUrl}
                    onClick={() => setConsentModal({ docType: item.documentType, label: item.label, viewUrl: item.viewUrl, readOnly: false })}
                  >
                    {item.viewUrl ? "Open & Sign" : "Not Available"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {consentModal && (
        <DocumentConsentModal
          open={!!consentModal}
          onOpenChange={(o) => { if (!o) setConsentModal(null); }}
          label={consentModal.label}
          viewUrl={consentModal.viewUrl}
          documentType={consentModal.docType}
          householdId={householdId}
          readOnly={consentModal.readOnly}
          onAccepted={() => {
            fetchComplianceStatus();
            setConsentModal(null);
          }}
        />
      )}
    </div>
  );
}



export default function Profile() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const requestedTab = new URLSearchParams(search).get("tab");
  const initialTab = requestedTab === "volunteer" ? "account" : requestedTab ?? "account";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loadCalendarFeed, setLoadCalendarFeed] = useState(false);

  const { data: user, isLoading, isError, refetch } = useGetMe();
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

  useEffect(() => {
    if (requestedTab === "volunteer") {
      navigate("/volunteer");
    }
  }, [navigate, requestedTab]);

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
  const [deleteAccountConfirmOpen, setDeleteAccountConfirmOpen] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { data: calSubscribeData, isLoading: calSubscribeLoading } = useGetCalendarSubscribeUrl({
    query: {
      enabled: !!user && activeTab === "account" && loadCalendarFeed,
      queryKey: getGetCalendarSubscribeUrlQueryKey(),
    },
  });
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

  useEffect(() => {
    if (!user || activeTab !== "account") return;
    // The feed is below the first interaction on the account tab, so it can
    // wait briefly for the form and core profile controls to become usable.
    const timer = window.setTimeout(() => setLoadCalendarFeed(true), 700);
    return () => window.clearTimeout(timer);
  }, [activeTab, user]);

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
  const { adminViewEnabled, setAdminView } = useAdminView();
  const isCoachOrAdmin = user?.role === "coach" || user?.role === "admin";
  const isStudent = user?.role === "student";
  useRoutePerformance("profile", user !== undefined, user !== undefined && !isLoading);

  const permanentlyDeleteMyAccount = async () => {
    if (deleteAccountConfirmation !== "DELETE MY ACCOUNT") return;

    setDeletingAccount(true);
    try {
      const response = await authedFetch(`${BASE_URL}/api/users/me`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteAccountConfirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({ title: data.error ?? "Could not delete account", variant: "destructive" });
        return;
      }

      queryClient.clear();
      setDeleteAccountConfirmOpen(false);
      try {
        await signOut({ redirectUrl: `${BASE_URL}/sign-in` });
      } catch {
        // The account has already been permanently removed. A plain navigation
        // keeps the user inside the installed app and lets Clerk clear any
        // remaining local session on its signed-out entry point.
        window.location.replace(`${BASE_URL}/sign-in`);
      }
    } catch {
      toast({ title: "Could not delete account. Please try again.", variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  };

  if (isLoading) return <ProfileSkeleton />;

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-6 md:px-8">
        <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">Couldn't load your profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and your family.</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 mb-3" role="note">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isStudent
              ? "My Account and Notifications are yours to manage. My Family is view-only."
              : "My Account and Notifications are yours to manage. My Family contains household settings and rider management."}
          </p>
        </div>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3" aria-label="Profile sections">
          <TabsTrigger value="account" className="min-h-11 flex items-center gap-1.5 px-2 text-xs sm:text-sm">
            <UserCircle className="h-4 w-4" /> My Account
          </TabsTrigger>
          <TabsTrigger value="notifications" className="min-h-11 flex items-center gap-1.5 px-2 text-xs sm:text-sm">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="family" className="min-h-11 flex items-center gap-1.5 px-2 text-xs sm:text-sm">
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
                      <FormControl><Input type="tel" placeholder="(555) 000-0000" {...field} onChange={e => field.onChange(formatPhoneInput(e.target.value))} /></FormControl>
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

          <Card className="mt-4 border-destructive/40" data-testid="account-deletion">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Delete Account
              </CardTitle>
              <CardDescription>
                Permanently remove your TrailTeam profile, sign-in account, and personal activity. This cannot be undone.
                {user?.householdId
                  ? " If you are the final member of your household, its household-only information will also be removed."
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isCoachOrAdmin && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Team staff: make sure another administrator can manage the team before deleting your account.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Shared events and discussions remain available to the team without your account attached. You can complete
                this request directly in the TrailTeam app—no email or support request is needed.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                onClick={() => setDeleteAccountConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Permanently delete my account
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Car className="h-5 w-5" /> Carpool Defaults</CardTitle>
              <CardDescription>Set your usual capacity once — it pre-fills the offer form and is used when you quickly claim a rider. Changes save automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {!loadCalendarFeed || calSubscribeLoading ? (
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

          {isCoachOrAdmin && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" /> Admin Mode
                </CardTitle>
                <CardDescription>
                  Show or hide the Admin and Season Builder tabs in your navigation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5 flex-1 mr-4">
                    <div className="text-sm font-medium">Show admin tabs</div>
                    <div className="text-xs text-muted-foreground">
                      Enables the Admin and Season Builder tabs. Turn off for a cleaner view during day-to-day use.
                    </div>
                  </div>
                  <Switch
                    checked={adminViewEnabled}
                    onCheckedChange={setAdminView}
                  />
                </div>
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
            <MyFamilyTab
              householdId={user.householdId}
              currentUserId={user.id}
              canInviteCoParent={user.role === "parent" || user.role === "coach"}
              readOnly={isStudent}
            />
          ) : (
            isStudent ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Home className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No household is linked yet</p>
                  <p className="text-xs mt-1">Ask a parent or guardian to invite you to their TrailTeam household.</p>
                </CardContent>
              </Card>
            ) : (
              <NoHouseholdSetup userId={user?.id} onCreated={() => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })} />
            )
          )}
        </TabsContent>

      </Tabs>

      <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
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

      <AlertDialog
        open={deleteAccountConfirmOpen}
        onOpenChange={(open) => {
          setDeleteAccountConfirmOpen(open);
          if (!open) setDeleteAccountConfirmation("");
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          data-testid="account-deletion-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your sign-in, profile, and personal TrailTeam activity. It cannot be undone. Type
              {" "}DELETE MY ACCOUNT{" "}to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-my-account-confirmation">Confirmation</Label>
            <Input
              id="delete-my-account-confirmation"
              data-testid="account-deletion-confirmation"
              value={deleteAccountConfirmation}
              onChange={(event) => setDeleteAccountConfirmation(event.target.value)}
              placeholder="DELETE MY ACCOUNT"
              autoComplete="off"
              inputMode="text"
              enterKeyHint="done"
              disabled={deletingAccount}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              data-testid="account-deletion-submit"
              disabled={deletingAccount || deleteAccountConfirmation !== "DELETE MY ACCOUNT"}
              onClick={permanentlyDeleteMyAccount}
            >
              {deletingAccount ? "Deleting account…" : "Delete my account permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
