import { useListPendingApprovals, useApproveUser, useListPods, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPendingApprovalsQueryKey } from "@workspace/api-client-react";
import { Check, Shield, Users, ClipboardCheck, FileText, Upload, ExternalLink, Trash2, Link2 } from "lucide-react";
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

  const fetchTeamDocs = async () => {
    const res = await fetch(`${BASE_URL}/api/team-documents`);
    if (res.ok) setTeamDocs(await res.json());
  };

  useEffect(() => { fetchTeamDocs(); }, []);

  const handleApprove = (userId: number, role: "coach" | "parent" | "student") => {
    const podId = selectedPods[userId];
    if (!podId) {
      toast({ title: "Select a pod first", variant: "destructive" });
      return;
    }

    approveUser.mutate({
      id: userId,
      data: { podId, role }
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

      <Tabs defaultValue="approvals">
        <TabsList>
          <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="trailheads">Trailheads</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>New Signups Awaiting Approval</CardTitle>
              <CardDescription>Assign new users to a pod and approve their account to give them access.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : pendingUsers && pendingUsers.filter(u => u.role !== "student").length > 0 ? (
                <div className="divide-y">
                  {pendingUsers.filter(u => u.role !== "student").map(user => (
                    <div key={user.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-lg">{user.firstName} {user.lastName}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        <div className="text-sm mt-1">Requested Role: <span className="font-medium capitalize">{user.role}</span></div>
                      </div>
                      <div className="flex items-center gap-3">
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
