import { useState, useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  useGetBoardThread,
  useListBoardPosts,
  useCreateBoardPost,
  useDeleteBoardPost,
  useDeleteBoardThread,
  usePinBoardThread,
  useToggleBoardReaction,
  useGetMe,
  useGetLinkPreview,
  getGetLinkPreviewQueryKey,
  getListBoardPostsQueryKey,
  getListBoardThreadsQueryKey
} from "@workspace/api-client-react";
import type { BoardReactionSummary } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { 
  AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Pin, Trash2, Send, Lock, MoreVertical, MessageSquare, RefreshCw
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
  disabled,
}: {
  targetType: "thread" | "post";
  targetId: number;
  reactions?: BoardReactionSummary["reactions"];
  onToggle: (targetType: "thread" | "post", targetId: number, reaction: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Reactions">
      {REACTIONS.map(({ key, emoji, label }) => {
        const summary = reactions?.[key] ?? { count: 0, reacted: false };
        return (
          <button
            key={key}
            type="button"
            aria-label={`${summary.reacted ? "Remove" : "Add"} ${label} reaction${summary.count ? `, ${summary.count}` : ""}`}
            aria-pressed={summary.reacted}
            disabled={disabled}
            onClick={() => onToggle(targetType, targetId, key)}
            className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors ${
              summary.reacted
                ? "border-primary bg-primary/10 text-primary"
                : "border-[#0a0c10]/20 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            {summary.count > 0 && <span>{summary.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function BoardThread() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const { data: thread, isLoading: isThreadLoading, isError: isThreadError, refetch: refetchThread } = useGetBoardThread(id);
  
  const { data: posts, isLoading: isPostsLoading, isError: isPostsError, refetch: refetchPosts } = useListBoardPosts(id, {
    query: { refetchInterval: 5000, queryKey: getListBoardPostsQueryKey(id) }
  });

  const createPost = useCreateBoardPost();
  const deletePost = useDeleteBoardPost();
  const deleteThread = useDeleteBoardThread();
  const pinThread = usePinBoardThread();
  const toggleReaction = useToggleBoardReaction();

  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  const isAuthor = thread?.authorUserId === me?.id;
  const canDeleteThread = isCoachOrAdmin || isAuthor;

  const handleToggleReaction = (targetType: "thread" | "post", targetId: number, reaction: string) => {
    toggleReaction.mutate({ data: { targetType, targetId, reaction: reaction as "helpful" | "like" | "celebrate" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBoardPostsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ["getBoardThread", id] });
      },
      onError: () => toast({ title: "Couldn’t update reaction", variant: "destructive" }),
    });
  };

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
        setLocation("/messages");
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
            <Link href="/messages"><ArrowLeft className="h-5 w-5" /></Link>
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="mt-0.5 shrink-0 rounded-full hover:bg-secondary sm:mt-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-2 border-[#0a0c10] shadow-cel-sm font-medium">
              {isCoachOrAdmin && (
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 px-4 py-5 pb-32 sm:px-6 sm:py-7 md:pb-7">
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
            <ReactionBar targetType="thread" targetId={thread.id} reactions={thread.reactions} onToggle={handleToggleReaction} disabled={toggleReaction.isPending} />
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
            const canDelete = isCoachOrAdmin || post.authorUserId === me?.id;
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
                     <ReactionBar targetType="post" targetId={post.id} reactions={post.reactions} onToggle={handleToggleReaction} disabled={toggleReaction.isPending} />
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

      <div className="fixed md:sticky bottom-[78px] md:bottom-0 left-0 right-0 z-20 border-t-2 border-[#0a0c10]/20 bg-background/95 p-3 backdrop-blur-md sm:p-4">
        <div className="max-w-3xl mx-auto">
          {thread.isLocked && !isCoachOrAdmin ? (
            <div className="bg-muted border-2 border-[#0a0c10] rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground font-bold tracking-wide">
              <Lock className="h-4 w-4" /> THIS THREAD IS LOCKED
            </div>
          ) : (
            <div className="flex items-end gap-2 bg-card border-2 border-[#0a0c10] rounded-2xl p-2 shadow-cel-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
              <Textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add to the conversation…"
                className="min-h-[44px] max-h-[150px] border-0 focus-visible:ring-0 resize-none px-2 py-3 bg-transparent shadow-none"
                disabled={createPost.isPending}
              />
              <Button 
                size="icon"
                onClick={handleSend}
                disabled={!replyBody.trim() || createPost.isPending}
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
