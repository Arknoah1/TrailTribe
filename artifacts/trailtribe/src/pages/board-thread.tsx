import { useEffect, useState, useRef } from "react";
import { useLocation, useParams, Link, useSearch } from "wouter";
import {
  useGetBoardThread,
  useListBoardPosts,
  useCreateBoardPost,
  useDeleteBoardPost,
  useDeleteBoardThread,
  usePinBoardThread,
  useToggleBoardReaction,
  useGetBoardReactionDetails,
  useGetMe,
  useGetLinkPreview,
  getGetLinkPreviewQueryKey,
  getGetBoardReactionDetailsQueryKey,
  getListBoardPostsQueryKey,
  getListBoardThreadsQueryKey
} from "@workspace/api-client-react";
import type { BoardReactionSummary } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { 
  AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Check, Pin, Trash2, Send, Lock, MoreVertical, MessageSquare, RefreshCw, SmilePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DiscussionTitle } from "@/components/discussion-title";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function LinkPreview({ url }: { url: string }) {
  const { data, isLoading } = useGetLinkPreview({ url }, { 
    query: { 
      enabled: !!url, 
      queryKey: getGetLinkPreviewQueryKey({ url }),
      retry: false
    } 
  });
  
  if (isLoading || !data) return null;
  
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 mb-2 border-2 border-[#0a0c10] rounded-xl overflow-hidden bg-card hover:bg-muted/50 transition-colors max-w-sm shadow-cel-sm block no-underline">
      <div className="p-3">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{data.hostname}</div>
        <div className="font-bold text-sm leading-tight mt-1 line-clamp-1">{data.title}</div>
        {data.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.description}</div>}
      </div>
    </a>
  );
}

function ParsedContent({ text, isDeleted }: { text: string; isDeleted?: boolean }) {
  if (isDeleted) {
    return <div className="text-muted-foreground italic bg-muted/50 px-3 py-2 rounded-md text-sm border border-dashed border-muted-foreground/30">[This message was deleted]</div>;
  }

  const parts = text.split(URL_REGEX);
  return (
    <div className="whitespace-pre-wrap break-words prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          return (
            <span key={i}>
              <a href={part} target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2 break-all">{part}</a>
              <LinkPreview url={part} />
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

const REACTIONS = [
  { key: "helpful", emoji: "💡", label: "Helpful" },
  { key: "like", emoji: "👍", label: "Like" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
] as const;

function ReactionBar({
  targetType,
  targetId,
  reactions,
  onToggle,
  onView,
  disabled,
}: {
  targetType: "thread" | "post";
  targetId: number;
  reactions?: BoardReactionSummary["reactions"];
  onToggle: (targetType: "thread" | "post", targetId: number, reaction: string) => void;
  onView: (targetType: "thread" | "post", targetId: number, reaction: "helpful" | "like" | "celebrate") => void;
  disabled?: boolean;
}) {
  const visibleReactions = REACTIONS.filter(({ key }) => {
    const summary = reactions?.[key];
    return Boolean(summary?.count || summary?.reacted);
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Reactions">
      {visibleReactions.map(({ key, emoji, label }) => {
        const summary = reactions?.[key] ?? { count: 0, reacted: false };
        return (
          <div
            key={key}
            className={`inline-flex h-9 items-center rounded-full border px-0.5 text-xs font-semibold shadow-sm transition-colors ${
              summary.reacted
                ? "border-primary bg-primary/10 text-primary"
                : "border-[#0a0c10]/20 bg-card text-foreground"
            }`}
          >
            <button
              type="button"
              aria-label={`${summary.reacted ? "Remove" : "Add"} ${label} reaction`}
              aria-pressed={summary.reacted}
              disabled={disabled}
              onClick={() => onToggle(targetType, targetId, key)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-background/70 disabled:cursor-not-allowed"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
            <button
              type="button"
              aria-label={`View ${summary.count} ${label.toLowerCase()} reaction${summary.count === 1 ? "" : "s"}`}
              onClick={() => onView(targetType, targetId, key)}
              className="inline-flex h-8 min-w-7 items-center justify-center rounded-full px-1.5 font-bold text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
            >
              {summary.count}
            </button>
          </div>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Choose a reaction"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#0a0c10]/25 bg-background px-3 text-xs font-bold text-muted-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SmilePlus className="h-3.5 w-3.5" />
            React
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-44 border-2 border-[#0a0c10] bg-card p-1.5 shadow-cel-sm">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose a reaction</p>
          {REACTIONS.map(({ key, emoji, label }) => {
            const summary = reactions?.[key] ?? { count: 0, reacted: false };
            return (
              <DropdownMenuItem
                key={key}
                onSelect={() => onToggle(targetType, targetId, key)}
                className="min-h-10 cursor-pointer rounded-lg px-2.5 py-2 font-semibold focus:bg-primary/10"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-base" aria-hidden="true">{emoji}</span>
                <span>{label}</span>
                {summary.reacted && <Check className="ml-auto h-4 w-4 text-primary" aria-label="Selected" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function BoardThread() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const { data: thread, isLoading: isThreadLoading, isError: isThreadError, refetch: refetchThread } = useGetBoardThread(id);
  
  const { data: posts, isLoading: isPostsLoading, isError: isPostsError, refetch: refetchPosts } = useListBoardPosts(id, {
    query: { refetchInterval: 5000, queryKey: getListBoardPostsQueryKey(id) }
  });

  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab");
  const returnTab = requestedTab === "pod" || requestedTab === "events" || requestedTab === "announcements"
    ? requestedTab
    : thread?.event
      ? "events"
      : "general";

  const createPost = useCreateBoardPost();
  const deletePost = useDeleteBoardPost();
  const deleteThread = useDeleteBoardThread();
  const pinThread = usePinBoardThread();
  const toggleReaction = useToggleBoardReaction();
  const [reactionDetails, setReactionDetails] = useState<{
    targetType: "thread" | "post";
    targetId: number;
    reaction: "helpful" | "like" | "celebrate";
  } | null>(null);
  const reactionDetailsQuery = useGetBoardReactionDetails(
    reactionDetails?.targetType ?? "thread",
    reactionDetails?.targetId ?? 0,
    { reaction: reactionDetails?.reaction ?? "helpful" },
    { query: {
      enabled: reactionDetails !== null,
      queryKey: getGetBoardReactionDetailsQueryKey(
        reactionDetails?.targetType ?? "thread",
        reactionDetails?.targetId ?? 0,
        { reaction: reactionDetails?.reaction ?? "helpful" },
      ),
    } },
  );

  const [replyBody, setReplyBody] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const layoutViewportHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    layoutViewportHeightRef.current = window.innerHeight;
    let lastWindowHeight = window.innerHeight;

    const updateKeyboardOffset = () => {
      const layoutViewportHeight = layoutViewportHeightRef.current ?? window.innerHeight;
      const visibleViewportBottom = visualViewport
        ? visualViewport.height + visualViewport.offsetTop
        : window.innerHeight;
      const nextOffset = Math.max(0, layoutViewportHeight - visibleViewportBottom);

      setKeyboardOffset(nextOffset);
      if (nextOffset === 0) {
        layoutViewportHeightRef.current = Math.max(layoutViewportHeight, window.innerHeight);
      }
    };

    const handleWindowResize = () => {
      // A rotation resizes the layout viewport as well as the visual viewport.
      // Keep the keyboard baseline in sync so the composer is not left at the
      // old portrait/landscape offset.
      if (!visualViewport || window.innerHeight !== lastWindowHeight) {
        layoutViewportHeightRef.current = window.innerHeight;
      }
      lastWindowHeight = window.innerHeight;
      updateKeyboardOffset();
    };

    const handleOrientationChange = () => {
      // Wait for both viewport dimensions to settle after the orientation
      // event. This also covers browsers that dispatch resize before the new
      // visual viewport dimensions are available.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          layoutViewportHeightRef.current = window.innerHeight;
          lastWindowHeight = window.innerHeight;
          updateKeyboardOffset();
        });
      });
    };

    updateKeyboardOffset();
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    visualViewport?.addEventListener("resize", updateKeyboardOffset);
    visualViewport?.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      visualViewport?.removeEventListener("resize", updateKeyboardOffset);
      visualViewport?.removeEventListener("scroll", updateKeyboardOffset);
    };
  }, []);

  useEffect(() => {
    const textarea = replyTextareaRef.current;
    if (!textarea) return;

    const maxHeight = 128;
    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 40), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [replyBody]);

  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  // Thread permissions are computed by the API so this UI cannot drift from
  // the authorization rules enforced by the server.
  const canDeleteThread = thread?.permissions?.canDelete === true;
  const canPinThread = thread?.permissions?.canPin === true;

  const handleToggleReaction = (targetType: "thread" | "post", targetId: number, reaction: string) => {
    toggleReaction.mutate({ data: { targetType, targetId, reaction: reaction as "helpful" | "like" | "celebrate" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBoardPostsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ["getBoardThread", id] });
      },
      onError: () => toast({ title: "Couldn’t update reaction", variant: "destructive" }),
    });
  };

  const handleViewReaction = (
    targetType: "thread" | "post",
    targetId: number,
    reaction: "helpful" | "like" | "celebrate",
  ) => setReactionDetails({ targetType, targetId, reaction });

  const handleSend = () => {
    if (!replyBody.trim()) return;
    createPost.mutate({ id, data: { body: replyBody.trim() } }, {
      onSuccess: () => {
        setReplyBody("");
        queryClient.invalidateQueries({ queryKey: getListBoardPostsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      },
      onError: () => toast({ title: "Failed to send message", variant: "destructive" })
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  const handleDeleteThread = () => {
    if (!confirm("Delete this thread and all replies?")) return;
    deleteThread.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Thread deleted" });
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
        setLocation(`/messages?tab=${returnTab}`);
      },
      onError: () => toast({ title: "Failed to delete thread", variant: "destructive" })
    });
  };

  const handlePin = () => {
    pinThread.mutate({ id }, {
      onSuccess: () => {
        toast({ title: thread?.isPinned ? "Thread unpinned" : "Thread pinned" });
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
      }
    });
  };

  if (isThreadLoading) return <div className="p-6 max-w-3xl mx-auto space-y-5"><Skeleton className="h-14 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  if (isThreadError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="h-7 w-7 mx-auto text-destructive" />
          <h1 className="mt-3 font-bold text-lg">Couldn&apos;t load this discussion</h1>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => refetchThread()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!thread) return <div className="p-8 text-center font-bold text-xl text-destructive uppercase tracking-widest">Thread not found</div>;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-30 border-b-2 border-[#0a0c10]/20 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-start gap-3 px-4 py-3 sm:items-center sm:px-6">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0 rounded-full hover:bg-secondary sm:mt-0">
            <Link href={`/messages?tab=${returnTab}`}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
            {thread.isPinned && <Pin className="h-4 w-4 text-primary fill-primary shrink-0" />}
            <DiscussionTitle>{thread.title}</DiscussionTitle>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {thread.event ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(new Date(thread.event.startTime), "EEE, MMM d")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> Team discussion
                </span>
              )}
              <span aria-hidden="true">•</span>
              <span>{thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
            </div>
          </div>
          
          {canDeleteThread && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Thread actions"
                  className="mt-0.5 shrink-0 rounded-full hover:bg-secondary sm:mt-0"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-2 border-[#0a0c10] shadow-cel-sm font-medium">
                {canPinThread && (
                  <DropdownMenuItem onClick={handlePin} className="cursor-pointer gap-2">
                    <Pin className="h-4 w-4" /> {thread.isPinned ? "Unpin Thread" : "Pin Thread"}
                  </DropdownMenuItem>
                )}
                {canDeleteThread && (
                  <DropdownMenuItem onClick={handleDeleteThread} className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10">
                    <Trash2 className="h-4 w-4" /> Delete Thread
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 px-4 py-5 pb-72 sm:px-6 sm:py-7 md:pb-7">
        <div className="flex w-full flex-1 flex-col gap-5">
          <section className="rounded-2xl border-2 border-[#0a0c10] border-l-4 border-l-primary bg-card p-4 shadow-cel-sm sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-[#0a0c10] shrink-0">
                <AvatarImage src={thread.author?.avatarUrl ?? undefined} />
                <AvatarFallback className="font-bold text-base">
                  {thread.author ? (thread.author.firstName[0] + thread.author.lastName[0]) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-foreground">
                    {thread.author ? `${thread.author.firstName} ${thread.author.lastName}` : "Unknown User"}
                  </span>
                  {thread.authorUserId === me?.id && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">You started this</Badge>}
                </div>
                <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                  Started {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className="text-foreground">
              <ParsedContent text={thread.body} />
            </div>
            <ReactionBar targetType="thread" targetId={thread.id} reactions={thread.reactions} onToggle={handleToggleReaction} onView={handleViewReaction} disabled={toggleReaction.isPending} />
          </section>

          <div className="flex items-center gap-3 px-1">
            <span className="h-px flex-1 bg-[#0a0c10]/15" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Replies
            </span>
            <span className="h-px flex-1 bg-[#0a0c10]/15" />
          </div>

          {isPostsLoading ? (
            <div className="space-y-4"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-20 w-3/4 rounded-2xl" /></div>
          ) : isPostsError ? (
            <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-5 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-destructive" />
              <p className="mt-2 font-bold text-sm">Couldn&apos;t load replies</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchPosts()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          ) : posts?.length ? (
            <div className="space-y-4 sm:pl-8">
              {posts.map(post => {
            const canDelete = post.permissions?.canDelete === true;
            return (
              <article key={post.id} className="flex gap-3 sm:gap-4">
                <Avatar className="h-9 w-9 border-2 border-[#0a0c10] shrink-0">
                  <AvatarImage src={post.author?.avatarUrl ?? undefined} />
                  <AvatarFallback className="font-bold text-sm">
                    {post.author ? (post.author.firstName[0] + post.author.lastName[0]) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-foreground">
                      {post.author ? `${post.author.firstName} ${post.author.lastName}` : "Unknown User"}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                    {!post.isDeleted && canDelete && (
                      <button 
                        onClick={() => {
                          if (confirm("Delete this message?")) {
                            deletePost.mutate({ id: post.id }, {
                              onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBoardPostsQueryKey(id) })
                            });
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="inline-block min-w-[50%] max-w-full rounded-2xl border border-[#0a0c10]/20 bg-card p-3 text-foreground shadow-sm transition-colors">
                    <ParsedContent text={post.body} isDeleted={post.isDeleted} />
                  </div>
                   {!post.isDeleted && (
                     <ReactionBar targetType="post" targetId={post.id} reactions={post.reactions} onToggle={handleToggleReaction} onView={handleViewReaction} disabled={toggleReaction.isPending} />
                   )}
                </div>
              </article>
            );
              })}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
              <div className="max-w-sm rounded-2xl border-2 border-dashed border-[#0a0c10]/30 bg-secondary/50 px-6 py-7 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#0a0c10] bg-card text-primary shadow-cel-sm">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-bold">Keep the ride conversation going</h2>
                <p className="mt-1 text-sm text-muted-foreground">No replies yet. Share a question, a plan, or a helpful update for the team.</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <Dialog open={reactionDetails !== null} onOpenChange={(open) => { if (!open) setReactionDetails(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {REACTIONS.find(({ key }) => key === reactionDetails?.reaction)?.emoji}{" "}
              {REACTIONS.find(({ key }) => key === reactionDetails?.reaction)?.label} reactions
            </DialogTitle>
            <DialogDescription>Members who reacted to this update</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto">
            {reactionDetailsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : reactionDetailsQuery.data?.members.length ? (
              <div className="space-y-2">
                {reactionDetailsQuery.data.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-lg border border-[#0a0c10]/15 bg-background p-2">
                    <Avatar className="h-8 w-8 border border-[#0a0c10]">
                      <AvatarImage src={member.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs font-bold">
                        {member.firstName[0]}{member.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold">{member.firstName} {member.lastName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No active members found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div
        data-testid="reply-composer"
        className="fixed bottom-[calc(var(--mobile-bottom-nav-height,78px)+var(--keyboard-offset))] md:sticky md:bottom-0 left-0 right-0 z-20 border-t-2 border-[#0a0c10]/20 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-4 md:pb-4"
        style={{ "--keyboard-offset": `${keyboardOffset}px` } as React.CSSProperties}
      >
        <div className="max-w-3xl mx-auto">
          {thread.isLocked && !isCoachOrAdmin ? (
            <div className="bg-muted border-2 border-[#0a0c10] rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground font-bold tracking-wide">
              <Lock className="h-4 w-4" /> THIS THREAD IS LOCKED
            </div>
          ) : (
            <div className="flex items-end gap-2 bg-card border-2 border-[#0a0c10] rounded-2xl p-2 shadow-cel-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
              <Textarea
                ref={replyTextareaRef}
                rows={1}
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add to the conversation…"
                aria-label="Reply to this discussion"
                className="!min-h-10 max-h-32 overflow-y-auto border-0 bg-transparent px-2 py-2 text-base leading-5 shadow-none focus-visible:ring-0"
                disabled={createPost.isPending}
              />
              <Button 
                size="icon"
                onClick={handleSend}
                disabled={!replyBody.trim() || createPost.isPending}
                aria-label="Send reply"
                className="shrink-0 h-10 w-10 rounded-lg cel-interactive border-2 border-[#0a0c10]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
