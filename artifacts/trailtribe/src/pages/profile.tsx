import {
  useGetMe, useUpdateMe, useGetHousehold, useUpdateHousehold, useUpdateHouseholdCompliance,
  getGetHouseholdQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { UserCircle, Home, Bike, ClipboardCheck, Link2, Plus, Trash2, Pencil, CheckCircle2, Copy, Check } from "lucide-react";
import { format } from "date-fns";

const profileSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  pushNotifications: z.boolean(),
});

const householdSchema = z.object({
  name: z.string().min(2),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

const riderSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  grade: z.coerce.number().int().min(6).max(12).optional(),
  allergies: z.string().optional(),
  medicalNotes: z.string().optional(),
});

type RiderFormValues = z.infer<typeof riderSchema>;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function RiderDialog({
  householdId,
  rider,
  onClose,
  onSaved,
}: {
  householdId: number;
  rider?: { id: number; firstName: string; lastName: string; grade?: number | null; allergies?: string | null; medicalNotes?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const form = useForm<RiderFormValues>({
    resolver: zodResolver(riderSchema),
    defaultValues: {
      firstName: rider?.firstName ?? "",
      lastName: rider?.lastName ?? "",
      grade: rider?.grade ?? undefined,
      allergies: rider?.allergies ?? "",
      medicalNotes: rider?.medicalNotes ?? "",
    },
  });

  const onSubmit = async (values: RiderFormValues) => {
    const url = rider
      ? `${BASE_URL}/api/households/${householdId}/riders/${rider.id}`
      : `${BASE_URL}/api/households/${householdId}/riders`;
    const method = rider ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
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
            <FormLabel>Grade (6–12)</FormLabel>
            <FormControl><Input type="number" min={6} max={12} {...field} value={field.value ?? ""} /></FormControl>
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
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : rider ? "Save Changes" : "Add Rider"}
        </Button>
      </form>
    </Form>
  );
}

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

  const complianceDocs = [
    { key: "liabilityWaiverSigned" as const, label: "Liability Waiver", date: household.liabilityWaiverSignedAt },
    { key: "mediaReleaseSigned" as const, label: "Media Release", date: household.mediaReleaseSignedAt },
    { key: "codeOfConductSigned" as const, label: "Code of Conduct", date: household.codeOfConductSignedAt },
  ];

  return (
    <div className="space-y-6">
      {/* Household info */}
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
            <DialogContent>
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
                    <div className="text-sm text-muted-foreground flex gap-3 mt-0.5">
                      {rider.grade && <span>Grade {rider.grade}</span>}
                      {rider.allergies && <span className="text-amber-600 dark:text-amber-500">⚠ {rider.allergies}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={riderDialogOpen && editingRider?.id === rider.id} onOpenChange={(o) => { setRiderDialogOpen(o); if (!o) setEditingRider(null); }}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRider(rider)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
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

      {/* Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Season Documents</CardTitle>
          <CardDescription>Required forms for participation. Check each once signed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {complianceDocs.map(({ key, label, date }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border p-4">
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
          ))}
        </CardContent>
      </Card>

      {/* Invite link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Invite a Co-Parent</CardTitle>
          <CardDescription>Share this link so another parent can join your household and see the same events and notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="font-mono text-xs bg-muted" />
            <Button variant="outline" size="icon" onClick={copyInvite} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Code: <span className="font-mono font-medium">{household.inviteCode}</span>
          </p>
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
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
    }
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || "",
        emailNotifications: user.emailNotifications,
        smsNotifications: user.smsNotifications,
        pushNotifications: user.pushNotifications,
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

  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and your family.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <UserCircle className="h-4 w-4" /> My Account
          </TabsTrigger>
          <TabsTrigger value="family" className="flex items-center gap-2">
            <Home className="h-4 w-4" /> My Family
          </TabsTrigger>
        </TabsList>

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
                      <FormControl><Input {...field} /></FormControl>
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

              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>How you want to be contacted by coaches.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: "emailNotifications" as const, label: "Email", desc: "Receive broadcasts via email." },
                    { name: "smsNotifications" as const, label: "SMS Text Messages", desc: "Get texts for urgent updates." },
                    { name: "pushNotifications" as const, label: "Push Notifications", desc: "Receive app notifications." },
                  ].map(({ name, label, desc }) => (
                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{label}</FormLabel>
                          <FormDescription>{desc}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )} />
                  ))}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="family" className="mt-6">
          {user?.householdId ? (
            <MyFamilyTab householdId={user.householdId} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Home className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                <h3 className="text-lg font-medium">No household yet</h3>
                <p className="text-muted-foreground max-w-sm mt-2">
                  You haven't been assigned to a household. Ask your coach to send you an invite link, or wait for your account to be approved.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
