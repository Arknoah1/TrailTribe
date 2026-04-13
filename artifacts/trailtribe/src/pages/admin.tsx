import { useListPendingApprovals, useApproveUser, useListPods, useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPendingApprovalsQueryKey } from "@workspace/api-client-react";
import { Check, X, Shield, Users, ClipboardCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function Admin() {
  const { data: pendingUsers, isLoading } = useListPendingApprovals();
  const { data: pods } = useListPods();
  const { data: summary } = useGetDashboardSummary();
  const approveUser = useApproveUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedPods, setSelectedPods] = useState<Record<number, string>>({});

  const handleApprove = (userId: number, role: "coach" | "parent" | "student") => {
    const podId = selectedPods[userId];
    if (!podId) {
      toast({ title: "Select a pod first", variant: "destructive" });
      return;
    }

    approveUser.mutate({
      data: {
        podId,
        role
      }
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
              ) : pendingUsers && pendingUsers.length > 0 ? (
                <div className="divide-y">
                  {pendingUsers.map(user => (
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
