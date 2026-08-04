import { useState, useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  useGetBoardThread,
  useListBoardPosts,
  useCreateBoardPost,
  useDeleteBoardPost,
  useDeleteBoardThread,
  usePinBoardThread,
  useGetMe,
  useGetLinkPreview,
  getGetLinkPreviewQueryKey,
  getListBoardPostsQueryKey,
  getListBoardThreadsQueryKey
} from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { 
  ArrowLeft, Pin, Trash2, Send, Lock, MoreVertical, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

export default function BoardThread() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const { data: thread, isLoading: isThreadLoading } = useGetBoardThread(id);
  
  const { data: posts, isLoading: isPostsLoading } = useListBoardPosts(id, {
    query: { refetchInterval: 5000, queryKey: getListBoardPostsQueryKey(id) }
  });

  const createPost = useCreateBoardPost();
  const deletePost = useDeleteBoardPost();
  const deleteThread = useDeleteBoardThread();
  const pinThread = usePinBoardThread();

  const [replyBody, setReplyBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCoachOrAdmin = me?.role === "coach" || me?.role === "admin";
  const isAuthor = thread?.authorUserId === me?.id;
  const canDeleteThread = isCoachOrAdmin || isAuthor;

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

  if (isThreadLoading) return <div className="p-8 max-w-3xl mx-auto space-y-4"><Skeleton className="h-10 w-32" /><Skeleton className="h-32 w-full" /></div>;
  if (!thread) return <div className="p-8 text-center font-bold text-xl text-destructive uppercase tracking-widest">Thread not found</div>;

  return (
    <div className="flex flex-col min-h-[100dvh] md:min-h-0 bg-background max-w-3xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b-2 border-[#0a0c10] shadow-cel-sm p-4 sm:px-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2 rounded-full hover:bg-muted">
            <Link href="/messages"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {thread.isPinned && <Pin className="h-4 w-4 text-primary fill-primary shrink-0" />}
            <h1 className="font-bold text-xl truncate">{thread.title}</h1>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
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

        {/* OP Content inside header area so it scrolls, wait no, let's keep OP as the first message in the scrollable area */}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-[160px] md:pb-32">
        {/* Original Post */}
        <div className="flex gap-4">
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-[#0a0c10] shrink-0">
            <AvatarImage src={thread.author?.avatarUrl ?? undefined} />
            <AvatarFallback className="font-bold text-lg">
              {thread.author ? (thread.author.firstName[0] + thread.author.lastName[0]) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-foreground">
                {thread.author ? `${thread.author.firstName} ${thread.author.lastName}` : "Unknown User"}
              </span>
              <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true })}
              </span>
              {thread.authorUserId === me?.id && <Badge variant="secondary" className="text-[10px] px-1.5 h-4">OP</Badge>}
            </div>
            <div className="text-foreground bg-card border-2 border-[#0a0c10] rounded-2xl rounded-tl-none p-4 shadow-cel-sm">
              <ParsedContent text={thread.body} />
            </div>
          </div>
        </div>

        {/* Replies */}
        {isPostsLoading ? (
          <div className="space-y-4 pl-12 sm:pl-16"><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-20 w-3/4 rounded-2xl" /></div>
        ) : (
          posts?.map(post => {
            const canDelete = isCoachOrAdmin || post.authorUserId === me?.id;
            return (
              <div key={post.id} className="flex gap-3 sm:gap-4 pl-8 sm:pl-12">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border-2 border-[#0a0c10] shrink-0">
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
                  <div className="text-foreground bg-secondary/50 border-2 border-transparent hover:border-[#0a0c10]/10 rounded-2xl rounded-tl-none p-3 transition-colors inline-block min-w-[50%]">
                    <ParsedContent text={post.body} isDeleted={post.isDeleted} />
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose Box */}
      <div className="fixed md:sticky bottom-[78px] md:bottom-auto left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t-2 border-[#0a0c10] z-20">
        <div className="max-w-3xl mx-auto">
          {thread.isLocked && !isCoachOrAdmin ? (
            <div className="bg-muted border-2 border-[#0a0c10] rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground font-bold tracking-wide">
              <Lock className="h-4 w-4" /> THIS THREAD IS LOCKED
            </div>
          ) : (
            <div className="flex items-end gap-2 bg-card border-2 border-[#0a0c10] rounded-xl p-2 shadow-cel-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
              <Textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply... (Cmd+Enter to send)"
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
