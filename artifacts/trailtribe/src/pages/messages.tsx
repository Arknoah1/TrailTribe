import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  useListBoardThreads,
  useListBroadcasts,
  useListPods,
  useGetMe,
  useMarkBoardSeen,
  useCreateBoardThread,
  usePinBoardThread,
  useDeleteBoardThread,
  useArchiveBroadcast,
  useUnarchiveBroadcast,
  getListBoardThreadsQueryKey,
  getListBroadcastsQueryKey,
} from "@workspace/api-client-react";
import type { BoardThreadWithDetails, BroadcastWithSender } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  Users,
  Flag,
  Calendar as CalendarIcon,
  Pin,
  Plus,
  Trash2,
  Mail,
  Smartphone,
  Bell,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { EmptyTrailState } from "@/components/illustrations";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const newThreadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Message body is required"),
});

function ThreadCard({ thread, podNameMap }: { thread: BoardThreadWithDetails; podNameMap: Map<string, string> }) {
  return (
    <Card className="hover:border-[#0a0c10] hover:shadow-cel-sm transition-all cursor-pointer">
      <CardContent className="p-4 sm:p-5">
        <div className="flex gap-4">
          <Avatar className="h-10 w-10 border border-[#0a0c10] shrink-0">
            <AvatarImage src={thread.author?.avatarUrl ?? undefined} />
            <AvatarFallback className="font-bold">
              {thread.author ? (thread.author.firstName[0] + thread.author.lastName[0]) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 title={thread.title} className="font-bold text-lg leading-tight truncate">
                  {thread.isPinned && <Pin className="inline-block h-4 w-4 mr-1.5 text-primary fill-primary" />}
                  {thread.title}
                </h3>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">
                    {thread.author ? `${thread.author.firstName} ${thread.author.lastName}` : "Unknown User"}
                  </span>
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(thread.lastReplyAt || thread.createdAt), { addSuffix: true })}</span>
                  {thread.podId && (
                    <>
                      <span>•</span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        {podNameMap.get(thread.podId) ?? "Pod"}
                      </Badge>
                    </>
                  )}
                  {thread.event && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-primary/30 text-primary">
                        <CalendarIcon className="h-3 w-3" />
                        {thread.event.title}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-bold">{thread.replyCount}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BroadcastCard({
  msg,
  podNameMap,
  isCoachOrAdmin,
  onArchive,
  onUnarchive,
}: {
  msg: BroadcastWithSender;
  podNameMap: Map<string, string>;
  isCoachOrAdmin: boolean;
  onArchive?: (id: number) => void;
  onUnarchive?: (id: number) => void;
}) {
  const isArchived = !!msg.archivedAt;
  return (
    <Card className={`overflow-hidden ${isArchived ? "opacity-60" : ""}`}>
      <CardHeader className="bg-muted/50 pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{msg.subject || "No Subject"}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">{msg.sender?.firstName} {msg.sender?.lastName}</span>
              <span>•</span>
              <span>{msg.sentAt ? format(new Date(msg.sentAt), "MMM d, yyyy 'at' h:mm a") : "Draft"}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {msg.isAllTeam ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Users className="h-3 w-3" /> All team
                </Badge>
              ) : msg.targetPodIds && msg.targetPodIds.length > 0 ? (
                msg.targetPodIds.map((podId: string) => (
                  <Badge key={podId} variant="secondary" className="text-xs">
                    {podNameMap.get(podId) ?? `Pod ${podId}`}
                  </Badge>
                ))
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {msg.channel === "email" && <Mail className="h-4 w-4 text-muted-foreground" />}
            {msg.channel === "sms" && <Smartphone className="h-4 w-4 text-muted-foreground" />}
            {msg.channel === "push" && <Bell className="h-4 w-4 text-muted-foreground" />}
            {isCoachOrAdmin && !isArchived && onArchive && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Archive this broadcast"
                onClick={() => onArchive(msg.id)}
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {isCoachOrAdmin && isArchived && onUnarchive && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Restore this broadcast"
                onClick={() => onUnarchive(msg.id)}
              >
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            )}
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
  );
}

function BroadcastsList({ podNameMap, isCoachOrAdmin }: { podNameMap: Map<string, string>; isCoachOrAdmin: boolean }) {
  const { data: broadcasts, isLoading, isError, refetch } = useListBroadcasts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const allBroadcasts = broadcasts ?? [];
  const active = allBroadcasts.filter(m => !m.archivedAt && (
    search.trim() === "" ||
    (m.subject ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (m.body ?? "").toLowerCase().includes(search.toLowerCase())
  ));
  const archived = allBroadcasts.filter(m => !!m.archivedAt && (
    search.trim() === "" ||
    (m.subject ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (m.body ?? "").toLowerCase().includes(search.toLowerCase())
  ));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBroadcastsQueryKey() });

  const archiveMutation = useArchiveBroadcast({
    mutation: {
      onSuccess: () => { toast({ title: "Broadcast archived" }); invalidate(); },
      onError: () => toast({ title: "Failed to archive broadcast", variant: "destructive" }),
    },
  });

  const unarchiveMutation = useUnarchiveBroadcast({
    mutation: {
      onSuccess: () => { toast({ title: "Broadcast restored" }); invalidate(); },
      onError: () => toast({ title: "Failed to restore broadcast", variant: "destructive" }),
    },
  });

  const handleArchive = (id: number) => archiveMutation.mutate({ id });
  const handleUnarchive = (id: number) => unarchiveMutation.mutate({ id });

  if (isLoading) return <div className="p-8 text-center"><Skeleton className="h-32 w-full mb-4" /><Skeleton className="h-32 w-full" /></div>;

  if (isError) {
    return (
      <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Couldn't load broadcasts</p>
          <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search broadcasts..."
          className="pl-10 bg-card"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {active.length > 0 ? (
        active.map(msg => (
          <BroadcastCard
            key={msg.id}
            msg={msg}
            podNameMap={podNameMap}
            isCoachOrAdmin={isCoachOrAdmin}
            onArchive={handleArchive}
          />
        ))
      ) : (
        <EmptyTrailState message={search ? "No broadcasts match your search." : "No broadcasts yet."} />
      )}

      {/* Archived section — coaches/admins only */}
      {isCoachOrAdmin && archived.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            {showArchived ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <Archive className="h-4 w-4" />
            {archived.length} archived broadcast{archived.length !== 1 ? "s" : ""}
          </button>
          {showArchived && (
            <div className="space-y-3 mt-3">
              {archived.map(msg => (
                <BroadcastCard
                  key={msg.id}
                  msg={msg}
                  podNameMap={podNameMap}
                  isCoachOrAdmin={isCoachOrAdmin}
                  onUnarchive={handleUnarchive}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadsList({ 
  scope, 
  podId, 
  podNameMap 
}: { 
  scope: "general" | "pod" | "event"; 
  podId?: string;
  podNameMap: Map<string, string>;
}) {
  const { data: threads, isLoading, isError, refetch } = useListBoardThreads({ scope, podId });

  // Event threads are ordered chronologically, then by most recent activity.
  const sortedThreads = [...(threads ?? [])].sort((a, b) => {
    if (scope === "event") {
      const aEventTime = a.event ? new Date(a.event.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bEventTime = b.event ? new Date(b.event.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      if (aEventTime !== bEventTime) {
        return aEventTime - bEventTime;
      }
    }

    const aDate = new Date(a.lastReplyAt || a.createdAt).getTime();
    const bDate = new Date(b.lastReplyAt || b.createdAt).getTime();
    return bDate - aDate;
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;

  if (isError) {
    return (
      <div className="rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Couldn't load threads</p>
          <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">Retry</Button>
      </div>
    );
  }

  if (!sortedThreads.length) {
    return <EmptyTrailState message="No threads here yet. Be the first to start a conversation!" />;
  }

  return (
    <div className="space-y-3">
      {sortedThreads.map(thread => (
        <Link key={thread.id} href={`/messages/thread/${thread.id}`} className="block">
          <ThreadCard thread={thread} podNameMap={podNameMap} />
        </Link>
      ))}
    </div>
  );
}

export default function Messages() {
  const { data: me } = useGetMe();
  const { data: pods } = useListPods();
  const markSeen = useMarkBoardSeen();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  const [activeTab, setActiveTab] = useState("general");
  const [sheetOpen, setSheetOpen] = useState(false);

  const podNameMap = new Map<string, string>((pods ?? []).map(p => [String(p.id), p.name]));

  const createThread = useCreateBoardThread();

  const form = useForm<z.infer<typeof newThreadSchema>>({
    resolver: zodResolver(newThreadSchema),
    defaultValues: { title: "", body: "" },
  });

  // Mark board seen on mount
  const markSeenMutateRef = useRef(markSeen.mutate);
  markSeenMutateRef.current = markSeen.mutate;
  useEffect(() => {
    markSeenMutateRef.current(undefined);
  }, []);

  const handleCreate = (values: z.infer<typeof newThreadSchema>) => {
    createThread.mutate({
      data: {
        title: values.title,
        body: values.body,
        podId: activeTab === "pod" ? me?.podId : null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Thread created" });
        setSheetOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
      },
      onError: () => toast({ title: "Failed to create thread", variant: "destructive" })
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4 md:pt-8 px-4 sm:px-6 md:px-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-widest text-foreground leading-none uppercase">Community Board</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">Connect, ask questions, and share with the team.</p>
        </div>
        <div className="flex gap-2">
          {isCoachOrAdmin && (
            <Button variant="outline" asChild className="cel-interactive border-2 border-[#0a0c10]">
              <Link href="/messages/new">New Broadcast</Link>
            </Button>
          )}
          {activeTab !== "events" && activeTab !== "announcements" && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button className="cel-interactive border-2 border-[#0a0c10]">
                  <Plus className="h-4 w-4 mr-2" /> New Thread
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] sm:h-[100vh] sm:max-w-md sm:side-right p-6 border-t-2 sm:border-l-2 border-[#0a0c10] sm:border-t-0 bg-background rounded-t-2xl sm:rounded-none">
                <SheetHeader className="mb-6">
                  <SheetTitle className="font-display text-2xl uppercase tracking-wider text-primary">
                    Start a {activeTab === "pod" ? "Pod" : "General"} Thread
                  </SheetTitle>
                </SheetHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-5">
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Subject</FormLabel>
                        <FormControl>
                          <Input placeholder="What's this about?" className="border-2 border-[#0a0c10]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="body" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Message</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Share your thoughts..." className="min-h-[200px] border-2 border-[#0a0c10]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full cel-interactive border-2 border-[#0a0c10]" disabled={createThread.isPending}>
                      {createThread.isPending ? "Posting..." : "Post Thread"}
                    </Button>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:inline-flex bg-muted/50 border-2 border-[#0a0c10] p-1 h-auto gap-1">
          <TabsTrigger value="general" className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-2 data-[state=active]:border-[#0a0c10] border-2 border-transparent font-bold tracking-wide py-2">
            General
          </TabsTrigger>
          {me?.podId && (
            <TabsTrigger value="pod" className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-2 data-[state=active]:border-[#0a0c10] border-2 border-transparent font-bold tracking-wide py-2">
              My Pod
            </TabsTrigger>
          )}
          <TabsTrigger value="events" className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-2 data-[state=active]:border-[#0a0c10] border-2 border-transparent font-bold tracking-wide py-2">
            Events
          </TabsTrigger>
          <TabsTrigger value="announcements" className="data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-2 data-[state=active]:border-[#0a0c10] border-2 border-transparent font-bold tracking-wide py-2">
            Broadcasts
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="general" className="mt-0">
            <ThreadsList scope="general" podNameMap={podNameMap} />
          </TabsContent>
          <TabsContent value="pod" className="mt-0">
            {me?.podId && <ThreadsList scope="pod" podId={me.podId} podNameMap={podNameMap} />}
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <ThreadsList scope="event" podNameMap={podNameMap} />
          </TabsContent>
          <TabsContent value="announcements" className="mt-0">
            <BroadcastsList podNameMap={podNameMap} isCoachOrAdmin={isCoachOrAdmin} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
