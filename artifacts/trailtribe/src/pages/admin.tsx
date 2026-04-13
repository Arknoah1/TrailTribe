import { useListPendingApprovals, useApproveUser, useListPods, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPendingApprovalsQueryKey } from "@workspace/api-client-react";
import { Check, Shield, Users, ClipboardCheck, FileText, Upload, ExternalLink, Trash2, Link2, CheckCircle2, XCircle, Bike, Phone, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";

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
  const [urlInput, setUrlInput] = useState(doc?.externalUrl ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = DOC_META[docType];

  const save = async (patch: Partial<{ objectPath: string; externalUrl: string; mimeType: string }>) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/team-documents/${docType}`, {
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
      const urlRes = await fetch(`${BASE_URL}/api/team-documents/upload-url`, { method: "POST" });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

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
    const res = await fetch(`${BASE_URL}/api/team-documents/${docType}`, { method: "DELETE" });
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

  const [selectedPods, setSelectedPods] = useState<Record<number, string>>({});
  const [teamDocs, setTeamDocs] = useState<TeamDocument[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");

  const fetchTeamDocs = async () => {
    const res = await fetch(`${BASE_URL}/api/team-documents`);
    if (res.ok) setTeamDocs(await res.json());
  };

  const fetchRoster = async () => {
    const res = await fetch(`${BASE_URL}/api/households`);
    if (res.ok) setRoster(await res.json());
  };

  useEffect(() => { fetchTeamDocs(); fetchRoster(); }, []);

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
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage team, approvals, and configuration.</p>
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
            <Input
              placeholder="Search families or riders..."
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              className="sm:w-64"
            />
          </div>

          {roster.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
                No families registered yet.
              </CardContent>
            </Card>
          ) : (
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
                                        const res = await fetch(`${BASE_URL}/api/users/${p.id}/role`, {
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

        <TabsContent value="pods" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pod Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Pod management features coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trailheads" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Trailhead Library</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Trailhead library features coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
