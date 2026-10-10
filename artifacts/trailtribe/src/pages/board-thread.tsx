import { useEffect, useState, useRef } from "react";
import { useLocation, useParams, Link, useSearch } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
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
  useSetBoardThreadMute,
  useCreateBoardThreadReport,
  getGetMeQueryKey,
  getGetBoardReactionDetailsQueryKey,
  getListBoardPostsQueryKey,
  getListBoardThreadsQueryKey
} from "@workspace/api-client-react";
import type { BoardReactionSummary } from "@workspace/api-client-react";
import { isOperationalStaff } from "@/lib/user-capabilities";
import { format, formatDistanceToNow } from "date-fns";
import { 
  AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Check, Pin, Trash2, Send, Lock, MoreVertical, MessageSquare, RefreshCw, SmilePlus, Bell, BellOff, Flag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DiscussionTitle } from "@/components/discussion-title";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComposerLinkPreview } from "@/components/link-preview";
import { DiscussionImagePicker, DiscussionImages, type DiscussionImagePickerHandle } from "@/components/discussion-images";
import { RichMessageEditor } from "@/components/rich-message-editor";
import { RichMessageContent } from "@/components/rich-message-content";
import { messageLinkPreviewText } from "@/lib/message-formatting.mjs";
import { getKeyboardInset } from "@/lib/mobile-keyboard-layout";
import { getReactionScrollTarget } from "@/lib/board-reaction-link";

function isEventDiscussionAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    data?: unknown;
  };
  if (candidate.status !== 403 || !candidate.data || typeof candidate.data !== "object") return false;

  return (candidate.data as { code?: unknown }).code === "EVENT_DISCUSSION_ACCESS_REVOKED";
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

  const {
    data: thread,
    isLoading: isThreadLoading,
    isError: isThreadError,
    error: threadError,
    refetch: refetchThread,
  } = useGetBoardThread(id);
  
  const { data: posts, isLoading: isPostsLoading, isError: isPostsError, refetch: refetchPosts } = useListBoardPosts(id, {
    query: { refetchInterval: 5000, queryKey: getListBoardPostsQueryKey(id) }
  });

  const search = useSearch();
  const reactionReplyParam = new URLSearchParams(search).get("reply");
  const reactionTargetParam = new URLSearchParams(search).get("target");
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
  const setThreadMute = useSetBoardThreadMute();
  const createThreadReport = useCreateBoardThreadReport();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"inappropriate_content" | "harassment" | "spam" | "other">("inappropriate_content");
  const [reportDetails, setReportDetails] = useState("");
  const isThreadMuted = me?.notificationPreferences?.mutedBoardDiscussionIds?.includes(id) ?? false;
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
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [replyImagesUploading, setReplyImagesUploading] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(320);
  const composerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyPickerRef = useRef<DiscussionImagePickerHandle>(null);
  const layoutViewportHeightRef = useRef<number | null>(null);
  const handledReactionTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      (!reactionReplyParam && reactionTargetParam !== "starter")
      || !thread
      || isPostsLoading
      || isPostsError
    ) return;

    const targetKey = `${id}:${reactionTargetParam ?? ""}:${reactionReplyParam ?? ""}`;
    if (handledReactionTargetRef.current === targetKey) return;

    const targetId = getReactionScrollTarget(posts, reactionReplyParam, reactionTargetParam);
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    handledReactionTargetRef.current = targetKey;
  }, [id, isPostsError, isPostsLoading, posts, reactionReplyParam, reactionTargetParam, thread]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    layoutViewportHeightRef.current = window.innerHeight;
    let lastWindowHeight = window.innerHeight;
    const nativeKeyboardInset = { current: 0 };

    const updateKeyboardOffset = () => {
      const layoutViewportHeight = layoutViewportHeightRef.current ?? window.innerHeight;
      const nextOffset = getKeyboardInset(
        layoutViewportHeight,
        visualViewport?.height ?? window.innerHeight,
        visualViewport?.offsetTop ?? 0,
        nativeKeyboardInset.current,
      );

      setKeyboardOffset(nextOffset);
      if (nextOffset === 0) {
        layoutViewportHeightRef.current = Math.max(layoutViewportHeight, window.innerHeight);
      }
    };

    const handleWindowResize = () => {
      // A rotation resizes the layout viewport as well as the visual viewport.
      // Keep the keyboard baseline in sync so the composer is not left at the
      // old portrait/landscape offset.
      const focusedElement = document.activeElement;
      const composerHasFocus = focusedElement instanceof HTMLElement
        && Boolean(composerRef.current?.contains(focusedElement));
      if (
        (!visualViewport || window.innerHeight !== lastWindowHeight)
        && !composerHasFocus
        && nativeKeyboardInset.current === 0
      ) {
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
    const nativeKeyboardListeners = Capacitor.isNativePlatform()
      ? [
          Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
            nativeKeyboardInset.current = keyboardHeight;
            updateKeyboardOffset();
          }),
          Keyboard.addListener("keyboardWillHide", () => {
            nativeKeyboardInset.current = 0;
            updateKeyboardOffset();
          }),
        ]
      : [];

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      visualViewport?.removeEventListener("resize", updateKeyboardOffset);
      visualViewport?.removeEventListener("scroll", updateKeyboardOffset);
      void Promise.all(nativeKeyboardListeners.map(listener => listener.then(handle => handle.remove())));
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

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const observer = new ResizeObserver(() => setComposerHeight(composer.getBoundingClientRect().height));
    observer.observe(composer);
    return () => observer.disconnect();
  }, [thread?.id]);

  const isCoachOrAdmin = isOperationalStaff(me);
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
    if (!replyBody.trim() || replyImagesUploading || createPost.isPending) return;
    createPost.mutate({ id, data: { body: replyBody.trim(), bodyFormat: "markdown", imageObjectPaths: replyImages } }, {
      onSuccess: () => {
        setReplyBody("");
        setReplyImages([]);
        queryClient.invalidateQueries({ queryKey: getListBoardPostsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListBoardThreadsQueryKey() });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      },
      onError: (error) => toast({ title: "Failed to send message", description: (error as { data?: { error?: string } }).data?.error, variant: "destructive" })
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

  const handleToggleThreadMute = () => {
    setThreadMute.mutate({ id, data: { muted: !isThreadMuted } }, {
      onSuccess: ({ muted }) => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: muted ? "Discussion alerts muted" : "Discussion alerts unmuted" });
      },
      onError: (error) => toast({
        title: "Couldn’t update discussion alerts",
        description: (error as { data?: { error?: string } }).data?.error,
        variant: "destructive",
      }),
    });
  };

  const handleSubmitThreadReport = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createThreadReport.mutate({
      id,
      data: { reason: reportReason, details: reportDetails.trim() || undefined },
    }, {
      onSuccess: () => {
        setReportDialogOpen(false);
        setReportReason("inappropriate_content");
        setReportDetails("");
        toast({ title: "Report sent to your coaches", description: "Thanks for helping keep discussions safe." });
      },
      onError: () => toast({ title: "Couldn’t send report", description: "Please try again.", variant: "destructive" }),
    });
  };

  if (isThreadLoading) return <div className="p-6 max-w-3xl mx-auto space-y-5"><Skeleton className="h-14 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  if (isThreadError) {
    if (isEventDiscussionAccessDenied(threadError)) {
      return (
        <div className="max-w-xl mx-auto px-4 py-12">
          <div
            className="rounded-2xl border-2 border-[#0a0c10]/20 bg-card p-6 text-center shadow-cel-sm"
            data-testid="event-discussion-access-error"
          >
            <Lock className="h-7 w-7 mx-auto text-muted-foreground" />
            <h1 className="mt-3 font-bold text-lg">This discussion is no longer available</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This saved link no longer opens the event discussion because access has changed or been removed.
            </p>
            <Button asChild className="mt-4 border-2 border-[#0a0c10]">
              <Link href="/messages?tab=events">View event discussions</Link>
            </Button>
          </div>
        </div>
      );
    }

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
    <div className="flex min-h-[100dvh] min-w-0 flex-col bg-background" style={{ "--reply-composer-height": `${composerHeight}px` } as React.CSSProperties}>
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

          <Button
            variant="outline"
            size="sm"
            aria-label={isThreadMuted ? "Unmute discussion alerts" : "Mute discussion alerts"}
            title={isThreadMuted ? "Unmute discussion alerts" : "Mute discussion alerts"}
            disabled={setThreadMute.isPending}
            onClick={handleToggleThreadMute}
            className="mt-0.5 h-9 shrink-0 gap-1.5 px-2 sm:mt-0 sm:px-3"
          >
            {isThreadMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{isThreadMuted ? "Unmute" : "Mute"}</span>
          </Button>
          
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
                <DropdownMenuItem onSelect={() => setReportDialogOpen(true)} className="cursor-pointer gap-2">
                  <Flag className="h-4 w-4" /> Report to coach
                </DropdownMenuItem>
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
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 px-4 py-5 pb-[calc(var(--reply-composer-height,320px)+100px)] sm:px-6 sm:py-7 md:pb-7">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          <section id="board-thread-starter" className="rounded-2xl border-2 border-[#0a0c10] border-l-4 border-l-primary bg-card p-4 shadow-cel-sm sm:p-5">
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
              <RichMessageContent text={thread.body} bodyFormat={thread.bodyFormat} linkPreviews />
              <DiscussionImages paths={thread.imageObjectPaths} />
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
              <article id={`board-thread-post-${post.id}`} key={post.id} className="flex gap-3 sm:gap-4">
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
                         aria-label="Delete reply"
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="inline-block min-w-[50%] max-w-full rounded-2xl border border-[#0a0c10]/20 bg-card p-3 text-foreground shadow-sm transition-colors">
                    <RichMessageContent text={post.body} bodyFormat={post.bodyFormat} isDeleted={post.isDeleted} linkPreviews />
                    {!post.isDeleted && <DiscussionImages paths={post.imageObjectPaths} />}
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

      <Dialog open={reportDialogOpen} onOpenChange={(open) => {
        if (!createThreadReport.isPending) setReportDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report this discussion</DialogTitle>
            <DialogDescription>Your report is private and will be sent to the coaching team.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitThreadReport} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="thread-report-reason" className="text-sm font-semibold">Why are you reporting this?</label>
              <select
                id="thread-report-reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value as typeof reportReason)}
                className="w-full min-h-11 rounded-lg border-2 border-[#0a0c10]/30 bg-background px-3 py-2 text-sm"
                data-testid="thread-report-reason"
              >
                <option value="inappropriate_content">Inappropriate content</option>
                <option value="harassment">Bullying or harassment</option>
                <option value="spam">Spam</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="thread-report-details" className="text-sm font-semibold">Additional details (optional)</label>
              <textarea
                id="thread-report-details"
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value.slice(0, 1000))}
                maxLength={1000}
                rows={4}
                className="w-full resize-y rounded-lg border-2 border-[#0a0c10]/30 bg-background px-3 py-2 text-sm"
                placeholder="Share any context that may help the coaches review it."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)} disabled={createThreadReport.isPending}>Cancel</Button>
              <Button type="submit" disabled={createThreadReport.isPending}>
                {createThreadReport.isPending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
        ref={composerRef}
        data-testid="reply-composer"
        className="fixed bottom-[max(var(--mobile-bottom-nav-height,78px),var(--keyboard-offset))] md:sticky md:bottom-0 left-0 right-0 z-20 border-t-2 border-[#0a0c10]/20 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-4 md:pb-4"
        style={{ "--keyboard-offset": `${keyboardOffset}px` } as React.CSSProperties}
      >
        <div className="max-w-3xl mx-auto">
          {thread.isLocked && !isCoachOrAdmin ? (
            <div className="bg-muted border-2 border-[#0a0c10] rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground font-bold tracking-wide">
              <Lock className="h-4 w-4" /> THIS THREAD IS LOCKED
            </div>
          ) : (
            <div className="max-h-[55dvh] overflow-y-auto space-y-2">
              <ComposerLinkPreview text={messageLinkPreviewText(replyBody)} />
              <DiscussionImagePicker ref={replyPickerRef} paths={replyImages} onChange={setReplyImages} onUploadingChange={setReplyImagesUploading} disabled={createPost.isPending} />
              <div className="flex items-end gap-2 bg-card border-2 border-[#0a0c10] rounded-2xl p-2 shadow-cel-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                <RichMessageEditor
                compact
                ref={replyTextareaRef}
                rows={1}
                value={replyBody}
                onChange={setReplyBody}
                onPasteImages={files => replyPickerRef.current?.uploadFiles(files)}
                onKeyDown={handleKeyDown}
                placeholder="Add to the conversation…"
                aria-label="Reply to this discussion"
                className="!min-h-10 max-h-32 overflow-y-auto border-0 bg-transparent px-2 py-2 text-base leading-5 shadow-none focus-visible:ring-0"
                disabled={createPost.isPending}
                />
                <Button
                size="icon"
                onClick={handleSend}
                disabled={!replyBody.trim() || createPost.isPending || replyImagesUploading}
                aria-label="Send reply"
                className="shrink-0 h-10 w-10 rounded-lg cel-interactive border-2 border-[#0a0c10]"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
