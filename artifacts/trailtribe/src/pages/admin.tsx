import { useListPendingApprovals, useApproveUser, useListPods, useGetDashboardSummary, useListEvents, useDeleteEvent, useUpdateEvent, useDeleteSeries, useRescheduleSeries, useCreateEvent, useListTrailheads, useCreateTrailhead, useUpdateTrailhead, useDeleteTrailhead, getListTrailheadsQueryKey, getListPodsQueryKey, CreateEventBodyEventType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPendingApprovalsQueryKey, getListEventsQueryKey } from "@workspace/api-client-react";
import { Check, Shield, Users, ClipboardCheck, FileText, Upload, ExternalLink, Trash2, Link2, CheckCircle2, XCircle, Bike, Phone, Mail, LayoutList, LayoutGrid, Plus, Pencil, Calendar, Layers, ChevronDown, ChevronUp, Mountain, ImageIcon, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { toLocalDateISO } from "@/lib/uuid";
import { Link } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type DocType = "liability_waiver" | "media_release" | "code_of_conduct";

interface TeamDocument {
  id: number;
  type: DocType;
  label: string;
  description: string | null;
  objectPath: string | null;
  externalUrl: string | null;
  viewUrl: string | null;
}

const DOC_META: Record<DocType, { label: string; description: string }> = {
  liability_waiver: {
    label: "Liability Waiver",
    description: "Required before participation. Releases the team from liability.",
  },
  media_release: {
    label: "Media Release",
    description: "Permission to use photos/videos of riders in team media.",
  },
  code_of_conduct: {
    label: "Code of Conduct",
    description: "Team rules and expectations for riders and families.",
  },
};

function DocumentCard({ docType, doc, onRefresh }: { docType: DocType; doc: TeamDocument | undefined; onRefresh: () => void }) {
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();
  const [urlInput, setUrlInput] = useState(doc?.externalUrl ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = DOC_META[docType];

  const save = async (patch: Partial<{ objectPath: string; externalUrl: string; mimeType: string }>) => {
    setIsSaving(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/team-documents/${docType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: meta.label, description: meta.description, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Document saved" });
      onRefresh();
    } catch {
      toast({ title: "Failed to save document", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUrlSave = async () => {
    if (!urlInput.trim()) {
      toast({ title: "Enter a URL first", variant: "destructive" });
      return;
    }
    await save({ externalUrl: urlInput.trim(), objectPath: "" });
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const urlRes = await authedFetch(`${BASE_URL}/api/team-documents/upload-url`, { method: "POST" });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // Upload directly to storage — no auth header needed for pre-signed URL
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      await save({ objectPath, externalUrl: "", mimeType: file.type || "application/pdf" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    const res = await authedFetch(`${BASE_URL}/api/team-documents/${docType}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "Document removed" }); onRefresh(); }
    else toast({ title: "Failed to remove", variant: "destructive" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {meta.label}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">{meta.description}</CardDescription>
          </div>
          {doc?.viewUrl && (
            <Badge variant="secondary" className="text-green-600 dark:text-green-400 shrink-0">
              ✓ Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {doc?.viewUrl ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/40 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate text-muted-foreground flex-1 font-mono text-xs">
              {doc.externalUrl ? doc.externalUrl : "Uploaded file"}
            </span>
            <a href={doc.viewUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No document linked yet.</p>
        )}

        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Replace / Set Document</Label>

          <div className="flex gap-2">
            <Input
              placeholder="Paste Google Doc, Drive, or PDF URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="text-sm"
            />
            <Button size="sm" variant="outline" onClick={handleUrlSave} disabled={isSaving} className="shrink-0">
              <Link2 className="h-3.5 w-3.5 mr-1" /> Link
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t" />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            {isUploading ? "Uploading..." : "Upload PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { data: pendingUsers, isLoading } = useListPendingApprovals();
  const { data: pods } = useListPods();
  const { data: summary } = useGetDashboardSummary();
  const approveUser = useApproveUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();

  const { data: allEvents, refetch: refetchEvents } = useListEvents({ archived: true });
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  const deleteSeries = useDeleteSeries();
  const rescheduleSeries = useRescheduleSeries();
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editingEventData, setEditingEventData] = useState<Record<string, any>>({});
  const [eventFilter, setEventFilter] = useState<"upcoming" | "all">("upcoming");
  const [shiftDaysInputs, setShiftDaysInputs] = useState<Record<string, string>>({});
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const createEvent = useCreateEvent();
  const [showAddEvent, setShowAddEvent] = useState(false);
  const emptyNewEvent: { title: string; description: string; eventType: CreateEventBodyEventType; startDate: string; startTime: string; endTime: string; trailheadId: string; isAllTeam: boolean; podId: string } = {
    title: "", description: "", eventType: CreateEventBodyEventType.practice, startDate: "", startTime: "09:00", endTime: "", trailheadId: "", isAllTeam: true, podId: "",
  };
  const [newEvent, setNewEvent] = useState(emptyNewEvent);

  const [selectedPods, setSelectedPods] = useState<Record<number, string>>({});
  const [teamDocs, setTeamDocs] = useState<TeamDocument[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterView, setRosterView] = useState<"family" | "individual">("family");

  // Pod management state
  const [newPodName, setNewPodName] = useState("");
  const [creatingPod, setCreatingPod] = useState(false);
  const [editingPodId, setEditingPodId] = useState<number | null>(null);
  const [editingPodName, setEditingPodName] = useState("");
  const [localRiderPods, setLocalRiderPods] = useState<Record<number, string>>({});
  const [podOrder, setPodOrder] = useState<number[]>([]);
  const podOrderRef = useRef<number[]>([]);
  const [podToDelete, setPodToDelete] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => {
    if (pods) {
      const ids = (pods as any[]).map((p: any) => p.id);
      podOrderRef.current = ids;
      setPodOrder(ids);
    }
  }, [pods]);

  // Trailhead management state
  const { data: trailheads } = useListTrailheads();
  const createTrailhead = useCreateTrailhead();
  const updateTrailhead = useUpdateTrailhead();
  const deleteTrailhead = useDeleteTrailhead();
  const emptyTrailhead = { name: "", address: "", googleMapsUrl: "", notes: "", photoObjectPath: "" };
  const [newTrailhead, setNewTrailhead] = useState(emptyTrailhead);
  const [showAddTrailhead, setShowAddTrailhead] = useState(false);
  const [editingTrailheadId, setEditingTrailheadId] = useState<number | null>(null);
  const [editingTrailheadData, setEditingTrailheadData] = useState(emptyTrailhead);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<"new" | number | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const newPhotoRef = useRef<HTMLInputElement>(null);
  const editPhotoRef = useRef<HTMLInputElement>(null);

  const createPod = async () => {
    if (!newPodName.trim()) return;
    setCreatingPod(true);
    const res = await authedFetch(`${BASE_URL}/api/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPodName.trim() }),
    });
    if (res.ok) {
      toast({ title: `Pod "${newPodName.trim()}" created` });
      setNewPodName("");
      queryClient.invalidateQueries({ queryKey: ["/api/pods"] });
    }
    setCreatingPod(false);
  };

  const renamePod = async (id: number) => {
    if (!editingPodName.trim()) return;
    const res = await authedFetch(`${BASE_URL}/api/pods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingPodName.trim() }),
    });
    if (res.ok) {
      toast({ title: "Pod renamed" });
      setEditingPodId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pods"] });
    }
  };

  const deletePod = (id: number, name: string) => {
    setPodToDelete({ id, name });
  };

  const confirmDeletePod = async () => {
    if (!podToDelete) return;
    const { id, name } = podToDelete;
    setPodToDelete(null);
    const res = await authedFetch(`${BASE_URL}/api/pods/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast({ title: `Pod "${name}" deleted` });
      const newOrder = podOrderRef.current.filter((pid) => pid !== id);
      podOrderRef.current = newOrder;
      setPodOrder(newOrder);
      queryClient.invalidateQueries({ queryKey: ["/api/pods"] });
    }
  };

  const movePod = async (id: number, direction: "up" | "down") => {
    const current = [...podOrderRef.current];
    const idx = current.indexOf(id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= current.length) return;
    [current[idx], current[swapIdx]] = [current[swapIdx], current[idx]];
    podOrderRef.current = current;
    setPodOrder(current);
    await authedFetch(`${BASE_URL}/api/pods/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: current }),
    });
  };

  const assignRiderPod = async (riderId: number, podId: string) => {
    setLocalRiderPods(prev => ({ ...prev, [riderId]: podId }));
    const res = await authedFetch(`${BASE_URL}/api/users/${riderId}/pod`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ podId: podId === "none" ? null : podId }),
    });
    if (res.ok) {
      toast({ title: "Pod updated" });
      fetchRoster();
    } else {
      setLocalRiderPods(prev => { const n = { ...prev }; delete n[riderId]; return n; });
      toast({ title: "Failed to update pod", variant: "destructive" });
    }
  };

  const fetchTeamDocs = async () => {
    const res = await authedFetch(`${BASE_URL}/api/team-documents`);
    if (res.ok) setTeamDocs(await res.json());
  };

  const fetchRoster = async () => {
    const res = await authedFetch(`${BASE_URL}/api/households`);
    if (res.ok) setRoster(await res.json());
  };

  useEffect(() => { fetchTeamDocs(); fetchRoster(); }, []);

  const trailheadPhotoUrl = (objectPath: string) =>
    `${BASE_URL}/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;

  const uploadTrailheadPhoto = useCallback(async (
    file: File,
    target: "new" | number,
  ): Promise<string> => {
    setUploadingPhotoFor(target);
    try {
      const urlRes = await authedFetch(`${BASE_URL}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      return objectPath as string;
    } finally {
      setUploadingPhotoFor(null);
    }
  }, [authedFetch]);

  const handleApprove = (userId: number, role: "coach" | "parent" | "student") => {
    const podId = selectedPods[userId];
    // Pod is only required for coaches, not parents
    if (role === "coach" && !podId) {
      toast({ title: "Select a pod for this coach first", variant: "destructive" });
      return;
    }

    approveUser.mutate({
      id: userId,
      data: { podId: podId ?? null, role }
    }, {
      onSuccess: () => {
        toast({ title: "User approved" });
        queryClient.invalidateQueries({ queryKey: getListPendingApprovalsQueryKey() });
      },
      onError: () => {
        toast({ title: "Error approving user", variant: "destructive" });
      }
    });
  };

  const docsByType = Object.fromEntries(teamDocs.map(d => [d.type, d])) as Record<DocType, TeamDocument | undefined>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="px-6 md:px-8 space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-widest text-foreground leading-none">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage team, approvals, and configuration.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Team Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalStudents} Students</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.totalFamilies} Families</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> Compliance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.complianceStats?.fullyCompliantCount ?? 0} / {summary.complianceStats?.totalHouseholds ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Families fully compliant</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" /> Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingUsers?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="roster">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="trailheads">Trailheads</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Team Roster</h2>
              <p className="text-sm text-muted-foreground">{roster.length} {roster.length === 1 ? "family" : "families"} registered</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search families or riders..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="sm:w-60"
              />
              <div className="flex items-center border border-border rounded-md overflow-hidden shrink-0">
                <button
                  onClick={() => setRosterView("family")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${rosterView === "family" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  title="By Family"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Family</span>
                </button>
                <button
                  onClick={() => setRosterView("individual")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${rosterView === "individual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  title="By Rider / Coach"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Riders</span>
                </button>
              </div>
            </div>
          </div>

          {roster.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
                No families registered yet.
              </CardContent>
            </Card>
          ) : rosterView === "individual" ? (() => {
            const q = rosterSearch.trim().toLowerCase();
            const allMembers = roster.flatMap((h: any) =>
              (h.members || []).map((m: any) => ({ ...m, householdName: h.name, household: h }))
            );
            const filtered = allMembers.filter((m: any) =>
              !q ||
              `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
              m.email?.toLowerCase().includes(q) ||
              m.householdName?.toLowerCase().includes(q)
            );
            const riders = filtered
              .filter((m: any) => m.role === "student")
              .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            const coaches = filtered
              .filter((m: any) => m.role === "coach")
              .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));

            return (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Bike className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Riders ({riders.length})</h3>
                  </div>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Gr.</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Pod</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Family</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Parent Contact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {riders.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No riders found</td></tr>
                          ) : riders.map((m: any) => {
                            const parents = (m.household.members || []).filter((p: any) => p.role === "parent" || p.role === "coach");
                            const pod = pods?.find((p: any) => String(p.id) === String(m.podId));
                            return (
                              <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2.5 font-medium">{m.firstName} {m.lastName}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{m.grade ? `Gr ${m.grade}` : "—"}</td>
                                <td className="px-4 py-2.5 hidden sm:table-cell">
                                  {pod ? <Badge variant="secondary" className="text-xs font-normal">{pod.name}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{m.householdName}</td>
                                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                                  <div className="space-y-0.5">
                                    {parents.map((p: any) => (
                                      <div key={p.id} className="text-xs">
                                        <span className="text-foreground">{p.firstName}</span>
                                        {p.email && !p.email.includes("@trailtribe") && <span> · {p.email}</span>}
                                        {p.phone && <span> · {p.phone}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Coaches ({coaches.length})</h3>
                  </div>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Family</th>
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {coaches.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No adults found</td></tr>
                          ) : coaches.map((m: any) => (
                            <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-medium">{m.firstName} {m.lastName}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                  m.role === "coach"
                                    ? "bg-primary/10 text-primary border-primary/30"
                                    : "bg-muted text-muted-foreground border-border"
                                }`}>{m.role === "coach" ? "Coach" : "Parent"}</span>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{m.householdName}</td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                                <div className="text-xs space-y-0.5">
                                  {m.email && !m.email.includes("@trailtribe") && <div className="flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" />{m.email}</div>}
                                  {m.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{m.phone}</div>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </div>
            );
          })() : (
            <div className="space-y-3">
              {roster
                .filter(h => {
                  if (!rosterSearch.trim()) return true;
                  const q = rosterSearch.toLowerCase();
                  return (
                    h.name?.toLowerCase().includes(q) ||
                    h.members?.some((m: any) =>
                      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
                      m.email?.toLowerCase().includes(q)
                    )
                  );
                })
                .map((household: any) => {
                  const parents = (household.members || []).filter((m: any) => m.role === "parent" || m.role === "coach");
                  const riders = (household.members || []).filter((m: any) => m.role === "student");
                  const isCompliant =
                    household.liabilityWaiverSigned &&
                    household.mediaReleaseSigned &&
                    household.codeOfConductSigned;
                  const pod = pods?.find((p: any) => p.id.toString() === household.podId);

                  return (
                    <Card key={household.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-base">{household.name}</h3>
                              {pod && <Badge variant="secondary" className="text-xs">{pod.name}</Badge>}
                              {isCompliant ? (
                                <Badge className="text-xs bg-green-600/20 text-green-600 border-green-600/30 hover:bg-green-600/20">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Compliant
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-600/40">
                                  <XCircle className="h-3 w-3 mr-1" /> Docs pending
                                </Badge>
                              )}
                            </div>

                            {parents.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {parents.map((p: any) => (
                                  <div key={p.id} className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                    <span className="font-medium text-foreground">{p.firstName} {p.lastName}</span>
                                    {p.email && !p.email.includes("@trailtribe") && (
                                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>
                                    )}
                                    {p.phone && (
                                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>
                                    )}
                                    <button
                                      onClick={async () => {
                                        const newRole = p.role === "coach" ? "parent" : "coach";
                                        const res = await authedFetch(`${BASE_URL}/api/users/${p.id}/role`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ role: newRole }),
                                        });
                                        if (res.ok) {
                                          toast({ title: `${p.firstName} is now a ${newRole}` });
                                          fetchRoster();
                                        }
                                      }}
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                                        p.role === "coach"
                                          ? "bg-primary/10 text-primary border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                                          : "bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                                      }`}
                                      title={p.role === "coach" ? "Click to remove coach role" : "Click to make coach"}
                                    >
                                      {p.role === "coach" ? "Coach ✕" : "Parent → Coach?"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {riders.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {riders.map((r: any) => (
                                  <div key={r.id} className="flex items-center gap-1.5 text-sm bg-muted rounded-full px-3 py-1">
                                    <Bike className="h-3 w-3 text-muted-foreground" />
                                    <span>{r.firstName} {r.lastName}</span>
                                    {r.grade && <span className="text-muted-foreground text-xs">· Gr {r.grade}</span>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {riders.length === 0 && (
                              <p className="mt-2 text-xs text-muted-foreground italic">No riders added yet</p>
                            )}
                          </div>

                          <div className="shrink-0 grid grid-cols-3 gap-1 text-center min-w-[140px]">
                            {[
                              { label: "Waiver", done: household.liabilityWaiverSigned },
                              { label: "Media", done: household.mediaReleaseSigned },
                              { label: "Conduct", done: household.codeOfConductSigned },
                            ].map(({ label, done }) => (
                              <div key={label} className="flex flex-col items-center gap-0.5">
                                {done
                                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  : <XCircle className="h-4 w-4 text-muted-foreground/40" />
                                }
                                <span className="text-[10px] text-muted-foreground">{label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approvals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>New Signups Awaiting Approval</CardTitle>
              <CardDescription>Review and approve new family accounts. Co-parents who join via invite link are auto-approved.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : pendingUsers && pendingUsers.length > 0 ? (
                <div className="divide-y">
                  {pendingUsers.map(user => (
                    <div key={user.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-lg">{user.firstName} {user.lastName}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        <div className="text-sm mt-1">Role: <span className="font-medium capitalize">{user.role}</span></div>
                      </div>
                      <div className="flex items-center gap-3">
                        {user.role === "coach" && (
                          <Select
                            value={selectedPods[user.id]}
                            onValueChange={(val) => setSelectedPods(prev => ({ ...prev, [user.id]: val }))}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Assign to Pod..." />
                            </SelectTrigger>
                            <SelectContent>
                              {pods?.map(pod => (
                                <SelectItem key={pod.id} value={pod.id.toString()}>{pod.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleApprove(user.id, user.role as any)}
                          disabled={approveUser.isPending}
                        >
                          <Check className="h-4 w-4 mr-2" /> Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  No pending approvals.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-6 space-y-4">
          {(() => {
            const now = new Date();
            const sorted = [...(allEvents ?? [])].sort((a, b) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            );
            const upcoming = sorted.filter(e => new Date(e.startTime) >= now);
            const past = sorted.filter(e => new Date(e.startTime) < now);
            const displayed = eventFilter === "upcoming" ? upcoming : sorted;

            const seriesGroups: Record<string, typeof sorted> = {};
            sorted.forEach(e => {
              if ((e as any).seriesId) {
                const sid = (e as any).seriesId as string;
                if (!seriesGroups[sid]) seriesGroups[sid] = [];
                seriesGroups[sid].push(e);
              }
            });
            const seriesIds = Object.keys(seriesGroups);

            const handleDelete = (id: number) => {
              if (!confirm("Delete this event?")) return;
              deleteEvent.mutate({ id }, {
                onSuccess: () => {
                  toast({ title: "Event deleted" });
                  queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                  refetchEvents();
                },
                onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
              });
            };

            const startEdit = (e: any) => {
              setEditingEventId(e.id);
              const dt = new Date(e.startTime);
              setEditingEventData({
                title: e.title,
                eventType: e.eventType,
                startDate: dt.toISOString().split("T")[0],
                startTime: dt.toTimeString().slice(0, 5),
                description: e.description ?? "",
                isAllTeam: e.isAllTeam ?? true,
                podId: (e.podIds && e.podIds.length > 0) ? String(e.podIds[0]) : "",
              });
            };

            const saveEdit = (id: number) => {
              const { title, eventType, startDate, startTime, description, isAllTeam, podId } = editingEventData;
              if (!isAllTeam && !podId) {
                toast({ title: "Select a pod or check All Team", variant: "destructive" });
                return;
              }
              const [y, m, d] = startDate.split("-").map(Number);
              const [h, min] = startTime.split(":").map(Number);
              const startDt = new Date(y, m - 1, d, h, min);
              updateEvent.mutate({
                id,
                data: {
                  title,
                  eventType,
                  startTime: startDt.toISOString(),
                  description: (description ?? "").trim(),
                  isAllTeam: isAllTeam ?? true,
                  podIds: (!isAllTeam && podId) ? [podId] : [],
                },
              }, {
                onSuccess: () => {
                  toast({ title: "Event updated" });
                  setEditingEventId(null);
                  refetchEvents();
                  queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                },
                onError: () => toast({ title: "Failed to update", variant: "destructive" }),
              });
            };

            const handleDeleteSeries = (seriesId: string) => {
              const group = seriesGroups[seriesId];
              const futureCount = group.filter(e => new Date(e.startTime) >= now).length;
              if (!confirm(`Delete ${futureCount} upcoming event${futureCount !== 1 ? "s" : ""} in this series?`)) return;
              deleteSeries.mutate({ seriesId, params: { fromDate: toLocalDateISO(now) } }, {
                onSuccess: (data) => {
                  toast({ title: `${(data as any).deleted} events deleted` });
                  refetchEvents();
                  queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                },
                onError: () => toast({ title: "Failed to delete series", variant: "destructive" }),
              });
            };

            const handleRescheduleSeries = (seriesId: string) => {
              const raw = shiftDaysInputs[seriesId] ?? "";
              const days = parseInt(raw, 10);
              if (isNaN(days) || days === 0) {
                toast({ title: "Enter a non-zero number of days to shift", variant: "destructive" });
                return;
              }
              rescheduleSeries.mutate(
                { seriesId, data: { shiftDays: days, fromDate: toLocalDateISO(now) } },
                {
                  onSuccess: (data) => {
                    toast({ title: `${(data as any).rescheduled} events shifted by ${days > 0 ? "+" : ""}${days} day${Math.abs(days) !== 1 ? "s" : ""}` });
                    setShiftDaysInputs(prev => { const n = {...prev}; delete n[seriesId]; return n; });
                    refetchEvents();
                    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                  },
                  onError: () => toast({ title: "Failed to reschedule series", variant: "destructive" }),
                }
              );
            };

            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold">All Events</h2>
                    <p className="text-sm text-muted-foreground">{upcoming.length} upcoming · {past.length} past</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-md overflow-hidden shrink-0">
                      {(["upcoming", "all"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setEventFilter(f)}
                          className={`px-3 py-2 text-sm transition-colors capitalize ${eventFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <Link href="/season-builder">
                      <Button size="sm" className="gap-1.5">
                        <Layers className="h-3.5 w-3.5" /> Season Builder
                      </Button>
                    </Link>
                  </div>
                </div>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Series</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {displayed.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
                              No events found.
                            </td>
                          </tr>
                        ) : displayed.map((ev: any) => {
                          const isEditing = editingEventId === ev.id;
                          const dt = new Date(ev.startTime);
                          const isPast = dt < now;
                          return (
                            <Fragment key={ev.id}>
                              <tr className={`hover:bg-muted/20 transition-colors ${isPast ? "opacity-60" : ""} ${isEditing ? "bg-muted/20" : ""}`}>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-1">
                                      <Input
                                        type="date"
                                        value={editingEventData.startDate}
                                        onChange={e => setEditingEventData((p: any) => ({ ...p, startDate: e.target.value }))}
                                        className="h-7 text-xs w-32"
                                      />
                                      <Input
                                        type="time"
                                        value={editingEventData.startTime}
                                        onChange={e => setEditingEventData((p: any) => ({ ...p, startTime: e.target.value }))}
                                        className="h-7 text-xs w-32"
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <div>{dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                                      <div className="text-muted-foreground/70">{dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 hidden sm:table-cell">
                                  {isEditing ? (
                                    <Select value={editingEventData.eventType} onValueChange={v => setEditingEventData((p: any) => ({ ...p, eventType: v }))}>
                                      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {["practice","race","social","volunteer","other"].map(t => (
                                          <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant="outline" className="text-xs font-normal capitalize">{ev.eventType}</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-medium">
                                  {isEditing ? (
                                    <Input
                                      value={editingEventData.title}
                                      onChange={e => setEditingEventData((p: any) => ({ ...p, title: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  ) : (
                                    ev.title
                                  )}
                                </td>
                                <td className="px-4 py-2.5 hidden md:table-cell">
                                  {ev.seriesId ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                      <Layers className="h-3 w-3" />
                                      Series
                                    </span>
                                  ) : <span className="text-xs text-muted-foreground">—</span>}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1">
                                    {isEditing ? (
                                      <>
                                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => saveEdit(ev.id)}>Save</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingEventId(null)}>Cancel</Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(ev)}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(ev.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isEditing && (
                                <tr className="bg-muted/20">
                                  <td colSpan={5} className="px-4 pb-3 pt-0">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
                                      <div className="sm:col-span-2 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Description <span className="font-normal">(optional)</span></Label>
                                        <Textarea
                                          placeholder="e.g. Early season skills — bring snacks"
                                          value={editingEventData.description ?? ""}
                                          onChange={e => setEditingEventData((p: any) => ({ ...p, description: e.target.value }))}
                                          className="text-sm min-h-[60px] resize-none"
                                        />
                                      </div>
                                      <div className="sm:col-span-2 space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Pod assignment</Label>
                                        <div className="flex flex-wrap items-center gap-3">
                                          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              checked={editingEventData.isAllTeam ?? true}
                                              onChange={e => setEditingEventData((p: any) => ({ ...p, isAllTeam: e.target.checked, podId: e.target.checked ? "" : p.podId }))}
                                              className="h-4 w-4 rounded border-border accent-primary"
                                            />
                                            All Team
                                          </label>
                                          {!(editingEventData.isAllTeam ?? true) && (
                                            <Select
                                              value={editingEventData.podId || "_none"}
                                              onValueChange={v => setEditingEventData((p: any) => ({ ...p, podId: v === "_none" ? "" : v }))}
                                            >
                                              <SelectTrigger className="h-8 w-44 text-xs">
                                                <SelectValue placeholder="Select pod…" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="_none">— No pod —</SelectItem>
                                                {pods?.map((pod: any) => (
                                                  <SelectItem key={pod.id} value={String(pod.id)}>{pod.name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    {showAddEvent ? (
                      <>
                        <h3 className="text-sm font-semibold flex items-center gap-1.5">
                          <Plus className="h-4 w-4 text-primary" /> New Event
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-xs">Title *</Label>
                            <Input
                              placeholder="e.g. Tuesday Practice"
                              value={newEvent.title}
                              onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
                            <textarea
                              placeholder="e.g. Early season skills — bring snacks"
                              value={newEvent.description}
                              onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))}
                              rows={2}
                              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type *</Label>
                            <Select value={newEvent.eventType} onValueChange={v => setNewEvent(p => ({ ...p, eventType: v as CreateEventBodyEventType }))}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.values(CreateEventBodyEventType) as string[]).map(t => (
                                  <SelectItem key={t} value={t} className="capitalize text-sm">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Date *</Label>
                            <Input
                              type="date"
                              value={newEvent.startDate}
                              onChange={e => setNewEvent(p => ({ ...p, startDate: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start time *</Label>
                            <Input
                              type="time"
                              value={newEvent.startTime}
                              onChange={e => setNewEvent(p => ({ ...p, startTime: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">End time <span className="text-muted-foreground">(optional)</span></Label>
                            <Input
                              type="time"
                              value={newEvent.endTime}
                              onChange={e => setNewEvent(p => ({ ...p, endTime: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-xs">Trailhead <span className="text-muted-foreground">(optional)</span></Label>
                            <Select
                              value={newEvent.trailheadId || "_none"}
                              onValueChange={v => setNewEvent(p => ({ ...p, trailheadId: v === "_none" ? "" : v }))}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">None</SelectItem>
                                {(trailheads ?? []).map(t => (
                                  <SelectItem key={t.id} value={String(t.id)} className="text-sm">{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-2 space-y-2">
                            <Label className="text-xs">Pod assignment</Label>
                            <div className="flex items-center gap-2">
                              <input
                                id="new-event-all-team"
                                type="checkbox"
                                checked={newEvent.isAllTeam}
                                onChange={e => setNewEvent(p => ({ ...p, isAllTeam: e.target.checked, podId: "" }))}
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                              <label htmlFor="new-event-all-team" className="text-sm cursor-pointer select-none">All Team</label>
                            </div>
                            {!newEvent.isAllTeam && (
                              <Select
                                value={newEvent.podId || "_none"}
                                onValueChange={v => setNewEvent(p => ({ ...p, podId: v === "_none" ? "" : v }))}
                              >
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select a pod..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">— select a pod —</SelectItem>
                                  {(pods ?? []).map(pod => (
                                    <SelectItem key={pod.id} value={String(pod.id)} className="text-sm">{pod.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 text-sm gap-1"
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
                                  refetchEvents();
                                  queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
                                },
                                onError: () => toast({ title: "Failed to create event", variant: "destructive" }),
                              });
                            }}
                          >
                            {createEvent.isPending ? "Saving..." : "Save Event"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-sm"
                            onClick={() => { setShowAddEvent(false); setNewEvent(emptyNewEvent); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setShowAddEvent(true)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Event
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {seriesIds.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" /> Series Management
                    </h3>
                    <div className="space-y-2">
                      {seriesIds.map(sid => {
                        const group = seriesGroups[sid];
                        const futureCount = group.filter(e => new Date(e.startTime) >= now).length;
                        const earliest = group.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
                        const latest = group[group.length - 1];
                        const isExpanded = expandedSeries[sid] ?? false;
                        return (
                          <Card key={sid}>
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{earliest.title.split(" — ")[0] || "Series"}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {group.length} event{group.length !== 1 ? "s" : ""} · {new Date(earliest.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(latest.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    {futureCount > 0 && ` · ${futureCount} upcoming`}
                                  </p>
                                </div>
                                <div className="flex gap-2 flex-wrap justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => setExpandedSeries(prev => ({ ...prev, [sid]: !isExpanded }))}
                                  >
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    {isExpanded ? "Hide" : "Show"} events
                                  </Button>
                                  <Link href={`/season-builder?seriesId=${encodeURIComponent(sid)}`}>
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                                      <Plus className="h-3 w-3" /> Add more
                                    </Button>
                                  </Link>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                    onClick={() => handleDeleteSeries(sid)}
                                    disabled={futureCount === 0}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete {futureCount} upcoming
                                  </Button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border pt-2 space-y-1">
                                  {[...group].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(ev => {
                                    const isPast = new Date(ev.startTime) < now;
                                    return (
                                      <div key={ev.id} className={`flex items-center justify-between text-xs py-1 px-2 rounded ${isPast ? "text-muted-foreground" : ""}`}>
                                        <span className="font-medium">{ev.title}</span>
                                        <span className="text-muted-foreground ml-2 shrink-0">
                                          {new Date(ev.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                          {isPast && " · past"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {futureCount > 0 && (
                                <div className="flex items-center gap-2 pt-1 border-t border-border">
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">Shift upcoming by</span>
                                  <Input
                                    type="number"
                                    placeholder="days (e.g. +7 or -3)"
                                    value={shiftDaysInputs[sid] ?? ""}
                                    onChange={e => setShiftDaysInputs(prev => ({ ...prev, [sid]: e.target.value }))}
                                    className="h-7 text-xs w-36"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs shrink-0"
                                    onClick={() => handleRescheduleSeries(sid)}
                                  >
                                    Shift dates
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="documents" className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Document Library</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload PDFs or paste links to documents families must review and sign. These will appear as clickable links in each family's profile.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["liability_waiver", "media_release", "code_of_conduct"] as DocType[]).map((type) => (
              <DocumentCard
                key={type}
                docType={type}
                doc={docsByType[type]}
                onRefresh={fetchTeamDocs}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pods" className="mt-6 space-y-6">
          {/* Pod list + create */}
          <Card>
            <CardHeader>
              <CardTitle>Pods</CardTitle>
              <CardDescription>Sub-groups for organizing riders by level or practice group.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!pods || pods.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No pods yet. Create one below.</p>
              ) : (() => {
                const orderedPods = podOrder.length
                  ? podOrder.map((id) => (pods as any[]).find((p: any) => p.id === id)).filter(Boolean)
                  : (pods as any[]);
                return (
                  <div className="divide-y divide-border rounded-lg border overflow-hidden">
                    {orderedPods.map((pod: any, idx: number) => (
                      <div key={pod.id} className="flex items-center gap-2 px-3 py-3 bg-card hover:bg-muted/30 transition-colors">
                        {editingPodId === pod.id ? (
                          <>
                            <Input
                              value={editingPodName}
                              onChange={(e) => setEditingPodName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") renamePod(pod.id); if (e.key === "Escape") setEditingPodId(null); }}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <Button size="sm" onClick={() => renamePod(pod.id)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPodId(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <Button size="icon" variant="ghost" className="h-5 w-5" disabled={idx === 0} onClick={() => movePod(pod.id, "up")}><ChevronUp className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5" disabled={idx === orderedPods.length - 1} onClick={() => movePod(pod.id, "down")}><ChevronDown className="h-3 w-3" /></Button>
                            </div>
                            <span className="flex-1 font-medium text-sm">{pod.name}</span>
                            <span className="text-xs text-muted-foreground">{pod.studentCount ?? 0} riders</span>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingPodId(pod.id); setEditingPodName(pod.name); }}>Rename</Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deletePod(pod.id, pod.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="New pod name..."
                  value={newPodName}
                  onChange={(e) => setNewPodName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createPod(); }}
                  className="h-9"
                />
                <Button size="sm" onClick={createPod} disabled={creatingPod || !newPodName.trim()}>
                  <Plus className="h-4 w-4 mr-1" /> Create
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rider → Pod assignment */}
          {(() => {
            const allRiders = roster
              .flatMap((h: any) =>
                (h.members || [])
                  .filter((m: any) => m.role === "student")
                  .map((m: any) => ({ ...m, householdName: h.name }))
              )
              .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            return (
              <Card>
                <CardHeader>
                  <CardTitle>Assign Riders to Pods</CardTitle>
                  <CardDescription>{allRiders.length} riders total</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rider</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Gr.</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Family</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pod</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {allRiders.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No riders yet</td></tr>
                        ) : allRiders.map((r: any) => {
                          const currentPodId = localRiderPods[r.id] !== undefined ? localRiderPods[r.id] : (r.podId ?? "none");
                          return (
                            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-medium">{r.firstName} {r.lastName}</td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{r.grade ? `Gr ${r.grade}` : "—"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{r.householdName}</td>
                              <td className="px-4 py-2.5">
                                <Select
                                  value={currentPodId}
                                  onValueChange={(val) => assignRiderPod(r.id, val)}
                                >
                                  <SelectTrigger className="h-8 w-40 text-xs">
                                    <SelectValue placeholder="Assign pod..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">— Unassigned —</SelectItem>
                                    {pods?.map((pod: any) => (
                                      <SelectItem key={pod.id} value={String(pod.id)}>{pod.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        <TabsContent value="trailheads" className="mt-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Trailhead Library</h2>
            <p className="text-sm text-muted-foreground mt-1">Saved meeting spots used in events and the Season Builder.</p>
          </div>

          {/* Hidden file inputs */}
          <input ref={newPhotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setNewPhotoPreview(URL.createObjectURL(file));
            try {
              const path = await uploadTrailheadPhoto(file, "new");
              setNewTrailhead(t => ({ ...t, photoObjectPath: path }));
            } catch {
              toast({ title: "Photo upload failed", variant: "destructive" });
              setNewPhotoPreview(null);
            }
            e.target.value = "";
          }} />
          <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || editingTrailheadId === null) return;
            setEditPhotoPreview(URL.createObjectURL(file));
            try {
              const path = await uploadTrailheadPhoto(file, editingTrailheadId);
              setEditingTrailheadData(d => ({ ...d, photoObjectPath: path }));
            } catch {
              toast({ title: "Photo upload failed", variant: "destructive" });
              setEditPhotoPreview(null);
            }
            e.target.value = "";
          }} />

          {/* Trailhead cards */}
          {!trailheads || trailheads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No trailheads yet. Add one below.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trailheads.map((th) => (
                <Card key={th.id} className="overflow-hidden flex flex-col">
                  {editingTrailheadId === th.id ? (
                    /* ── EDIT MODE ─────────────────────────────── */
                    <CardContent className="pt-4 space-y-3 flex-1">
                      {/* Photo */}
                      <div className="relative rounded-lg overflow-hidden bg-muted h-36 flex items-center justify-center">
                        {editPhotoPreview || editingTrailheadData.photoObjectPath ? (
                          <img
                            src={editPhotoPreview ?? trailheadPhotoUrl(editingTrailheadData.photoObjectPath)}
                            alt="Trailhead"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Mountain className="h-10 w-10 text-muted-foreground/30" />
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="absolute bottom-2 right-2 h-7 text-xs gap-1"
                          disabled={uploadingPhotoFor === th.id}
                          onClick={() => editPhotoRef.current?.click()}
                        >
                          <ImageIcon className="h-3 w-3" />
                          {uploadingPhotoFor === th.id ? "Uploading…" : "Change photo"}
                        </Button>
                        {editingTrailheadData.photoObjectPath && (
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute top-2 right-2 h-6 w-6"
                            onClick={() => { setEditingTrailheadData(d => ({ ...d, photoObjectPath: "" })); setEditPhotoPreview(null); }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Input
                        value={editingTrailheadData.name}
                        onChange={(e) => setEditingTrailheadData(d => ({ ...d, name: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="Name *"
                        autoFocus
                      />
                      <Input
                        value={editingTrailheadData.address}
                        onChange={(e) => setEditingTrailheadData(d => ({ ...d, address: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="Address"
                      />
                      <Input
                        value={editingTrailheadData.googleMapsUrl}
                        onChange={(e) => setEditingTrailheadData(d => ({ ...d, googleMapsUrl: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="Google Maps URL"
                      />
                      <Textarea
                        value={editingTrailheadData.notes}
                        onChange={(e) => setEditingTrailheadData(d => ({ ...d, notes: e.target.value }))}
                        className="text-sm min-h-[80px] resize-none"
                        placeholder="Parking details, trail signs, route notes…"
                      />
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={!editingTrailheadData.name.trim() || updateTrailhead.isPending || uploadingPhotoFor === th.id}
                          onClick={() => {
                            updateTrailhead.mutate(
                              {
                                id: th.id,
                                data: {
                                  name: editingTrailheadData.name.trim(),
                                  address: editingTrailheadData.address.trim() || undefined,
                                  googleMapsUrl: editingTrailheadData.googleMapsUrl.trim() || undefined,
                                  notes: editingTrailheadData.notes.trim() || undefined,
                                  photoObjectPath: editingTrailheadData.photoObjectPath || undefined,
                                },
                              },
                              {
                                onSuccess: () => {
                                  toast({ title: "Trailhead updated" });
                                  setEditingTrailheadId(null);
                                  setEditPhotoPreview(null);
                                  queryClient.invalidateQueries({ queryKey: getListTrailheadsQueryKey() });
                                },
                                onError: () => toast({ title: "Failed to update trailhead", variant: "destructive" }),
                              }
                            );
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingTrailheadId(null); setEditPhotoPreview(null); }}>Cancel</Button>
                      </div>
                    </CardContent>
                  ) : (
                    /* ── VIEW MODE ─────────────────────────────── */
                    <>
                      {/* Photo / map preview / placeholder */}
                      <div className="h-36 bg-muted/60 flex items-center justify-center overflow-hidden">
                        {th.photoObjectPath ? (
                          <img
                            src={trailheadPhotoUrl(th.photoObjectPath)}
                            alt={th.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (th.address || th.googleMapsUrl) ? (
                          <iframe
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(th.address ?? th.name)}&output=embed`}
                            className="w-full h-full border-0 pointer-events-none"
                            title={`Map of ${th.name}`}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        ) : (
                          <Mountain className="h-10 w-10 text-muted-foreground/30" />
                        )}
                      </div>
                      <CardContent className="pt-3 pb-3 flex flex-col gap-2 flex-1">
                        <p className="font-semibold text-sm leading-tight">{th.name}</p>
                        {th.address && (
                          <p className="text-xs text-muted-foreground leading-snug">{th.address}</p>
                        )}
                        {th.googleMapsUrl && (
                          <a href={th.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs w-fit">
                            <ExternalLink className="h-3 w-3" /> Open Map
                          </a>
                        )}
                        {th.notes && (
                          <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 leading-relaxed whitespace-pre-wrap mt-1">{th.notes}</p>
                        )}
                        <div className="flex items-center gap-1 mt-auto pt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingTrailheadId(th.id);
                              setEditPhotoPreview(null);
                              setEditingTrailheadData({
                                name: th.name,
                                address: th.address ?? "",
                                googleMapsUrl: th.googleMapsUrl ?? "",
                                notes: th.notes ?? "",
                                photoObjectPath: th.photoObjectPath ?? "",
                              });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              deleteTrailhead.mutate(
                                { id: th.id },
                                {
                                  onSuccess: () => {
                                    toast({ title: "Trailhead deleted" });
                                    queryClient.invalidateQueries({ queryKey: getListTrailheadsQueryKey() });
                                  },
                                  onError: () => toast({ title: "Failed to delete trailhead", variant: "destructive" }),
                                }
                              );
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </CardContent>
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Add Trailhead */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Add Trailhead</CardTitle>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setShowAddTrailhead(v => !v); setNewTrailhead(emptyTrailhead); setNewPhotoPreview(null); }}>
                  {showAddTrailhead ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {showAddTrailhead && (
              <CardContent className="space-y-3 pt-0">
                {/* Photo */}
                <div className="relative rounded-lg overflow-hidden bg-muted h-36 flex items-center justify-center">
                  {newPhotoPreview || newTrailhead.photoObjectPath ? (
                    <img
                      src={newPhotoPreview ?? trailheadPhotoUrl(newTrailhead.photoObjectPath)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Mountain className="h-10 w-10 text-muted-foreground/30" />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-2 right-2 h-7 text-xs gap-1"
                    disabled={uploadingPhotoFor === "new"}
                    onClick={() => newPhotoRef.current?.click()}
                  >
                    <ImageIcon className="h-3 w-3" />
                    {uploadingPhotoFor === "new" ? "Uploading…" : "Add photo"}
                  </Button>
                  {(newPhotoPreview || newTrailhead.photoObjectPath) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => { setNewTrailhead(t => ({ ...t, photoObjectPath: "" })); setNewPhotoPreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Name *"
                  value={newTrailhead.name}
                  onChange={(e) => setNewTrailhead(t => ({ ...t, name: e.target.value }))}
                  className="text-sm"
                  autoFocus
                />
                <Input
                  placeholder="Address (optional)"
                  value={newTrailhead.address}
                  onChange={(e) => setNewTrailhead(t => ({ ...t, address: e.target.value }))}
                  className="text-sm"
                />
                <Input
                  placeholder="Google Maps URL (optional)"
                  value={newTrailhead.googleMapsUrl}
                  onChange={(e) => setNewTrailhead(t => ({ ...t, googleMapsUrl: e.target.value }))}
                  className="text-sm"
                />
                <Textarea
                  placeholder="Parking details, trail signs, route notes… (optional)"
                  value={newTrailhead.notes}
                  onChange={(e) => setNewTrailhead(t => ({ ...t, notes: e.target.value }))}
                  className="text-sm min-h-[80px] resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!newTrailhead.name.trim() || createTrailhead.isPending || uploadingPhotoFor === "new"}
                    onClick={() => {
                      createTrailhead.mutate(
                        {
                          data: {
                            name: newTrailhead.name.trim(),
                            address: newTrailhead.address.trim() || undefined,
                            googleMapsUrl: newTrailhead.googleMapsUrl.trim() || undefined,
                            notes: newTrailhead.notes.trim() || undefined,
                            photoObjectPath: newTrailhead.photoObjectPath || undefined,
                          },
                        },
                        {
                          onSuccess: () => {
                            toast({ title: "Trailhead added" });
                            setNewTrailhead(emptyTrailhead);
                            setNewPhotoPreview(null);
                            setShowAddTrailhead(false);
                            queryClient.invalidateQueries({ queryKey: getListTrailheadsQueryKey() });
                          },
                          onError: () => toast({ title: "Failed to add trailhead", variant: "destructive" }),
                        }
                      );
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Trailhead
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddTrailhead(false); setNewTrailhead(emptyTrailhead); setNewPhotoPreview(null); }}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!podToDelete} onOpenChange={(open) => { if (!open) setPodToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pod "{podToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(podToDelete && (pods as any[])?.find((p: any) => p.id === podToDelete.id)?.studentCount > 0)
                ? `${(pods as any[]).find((p: any) => p.id === podToDelete.id)?.studentCount} rider(s) in this pod will become unassigned.`
                : "This pod has no riders assigned. It will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeletePod}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
