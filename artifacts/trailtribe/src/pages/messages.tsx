import { useState } from "react";
import { useListBroadcasts, useListPods } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Smartphone, Bell, Search, CheckCircle2, XCircle, AlertCircle, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";

export default function Messages() {
  const { data: broadcasts, isLoading } = useListBroadcasts();
  const { data: pods } = useListPods();

  const [search, setSearch] = useState("");
  const [podFilter, setPodFilter] = useState<string>("all");

  const podNameMap = new Map<string, string>(
    (pods ?? []).map(p => [String(p.id), p.name])
  );

  const filtered = (broadcasts ?? []).filter(msg => {
    const matchesSearch =
      search.trim() === "" ||
      (msg.subject ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (msg.body ?? "").toLowerCase().includes(search.toLowerCase());

    const matchesPod =
      podFilter === "all" ||
      msg.isAllTeam === true ||
      (msg.targetPodIds ?? []).includes(podFilter);

    return matchesSearch && matchesPod;
  });

  if (isLoading) return <div className="p-8 text-center">Loading messages...</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground mt-1">Archive of team broadcasts and announcements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/messages/contact">Contact Coach</Link>
          </Button>
          <Button asChild>
            <Link href="/messages/new">New Broadcast</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            className="pl-10 bg-card"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {pods && pods.length > 0 && (
          <Select value={podFilter} onValueChange={setPodFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card">
              <SelectValue placeholder="Filter by pod" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All audiences</SelectItem>
              {pods.map(pod => (
                <SelectItem key={pod.id} value={String(pod.id)}>
                  {pod.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-4">
        {filtered.length > 0 ? (
          filtered.map(msg => (
            <Card key={msg.id} className="overflow-hidden">
              <CardHeader className="bg-muted/50 pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{msg.subject || "No Subject"}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{msg.sender?.firstName} {msg.sender?.lastName}</span>
                      <span>•</span>
                      <span>{msg.sentAt ? format(new Date(msg.sentAt), "MMM d, yyyy 'at' h:mm a") : 'Draft'}</span>
                    </div>
                    <div className="mt-2">
                      {msg.isAllTeam ? (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Users className="h-3 w-3" /> All team
                        </Badge>
                      ) : msg.targetPodIds && msg.targetPodIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {msg.targetPodIds.map(podId => (
                            <Badge key={podId} variant="secondary" className="text-xs">
                              {podNameMap.get(podId) ?? `Pod ${podId}`}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {msg.channel === 'email' && <Mail className="h-4 w-4 text-muted-foreground" aria-label="Email" />}
                    {msg.channel === 'sms' && <Smartphone className="h-4 w-4 text-muted-foreground" aria-label="SMS" />}
                    {msg.channel === 'push' && <Bell className="h-4 w-4 text-muted-foreground" aria-label="Push" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="text-sm whitespace-pre-wrap prose dark:prose-invert max-w-none">{msg.body}</div>
                {msg.channel === "email" && (
                  <div className="pt-2 border-t border-border/50">
                    {!msg.emailConfigured ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Email delivery not configured
                      </span>
                    ) : msg.deliveredCount != null ? (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1.5 text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Delivered to {msg.deliveredCount} of {msg.recipientCount} recipients
                        </span>
                        {msg.failedCount != null && msg.failedCount > 0 && (
                          <span className="flex items-center gap-1.5 text-destructive">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            {msg.failedCount} failed
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Delivery status unavailable
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center p-12 border rounded-lg bg-card">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No messages found</h3>
            <p className="text-muted-foreground">
              {search || podFilter !== "all"
                ? "Try adjusting your search or filter."
                : "You haven't received any broadcasts yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
