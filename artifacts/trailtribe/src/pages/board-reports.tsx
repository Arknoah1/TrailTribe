import { useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  getListBoardPostingRestrictionsQueryKey,
  getListBoardReportsQueryKey,
  getListResolvedBoardReportsQueryKey,
  useDeleteBoardPost,
  useDeleteBoardThread,
  useListBoardPostingRestrictions,
  useListBoardReports,
  useListResolvedBoardReports,
  useResolveBoardReport,
  useSetBoardPostingRestriction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Flag, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";

const REASONS: Record<string, string> = {
  inappropriate_content: "Inappropriate content",
  harassment: "Bullying or harassment",
  spam: "Spam",
  other: "Other",
};

export default function BoardReportsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reportsQuery = useListBoardReports();
  const restrictionsQuery = useListBoardPostingRestrictions();
  const resolveReport = useResolveBoardReport();
  const setRestriction = useSetBoardPostingRestriction();
  const deleteThread = useDeleteBoardThread();
  const deletePost = useDeleteBoardPost();
  const [resolutionNotes, setResolutionNotes] = useState<Record<number, string>>({});
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const resolvedReportsQuery = useListResolvedBoardReports({
    query: { enabled: showResolvedHistory, queryKey: getListResolvedBoardReportsQueryKey() },
  });

  const refreshSafetyData = () => {
    void queryClient.invalidateQueries({ queryKey: getListBoardReportsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListResolvedBoardReportsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListBoardPostingRestrictionsQueryKey() });
  };

  const handleRemove = (reportId: number, targetType: "thread" | "reply", threadId: number | null, postId: number | null) => {
    if (!window.confirm(`Remove this reported ${targetType === "reply" ? "reply" : "discussion"} from the Board?`)) return;
    const mutation = targetType === "reply" && postId
      ? deletePost.mutateAsync({ id: postId })
      : threadId
        ? deleteThread.mutateAsync({ id: threadId })
        : null;
    if (!mutation) {
      toast({ title: "This content is no longer available", variant: "destructive" });
      return;
    }
    void mutation.then(() => {
      toast({ title: "Reported content removed" });
      refreshSafetyData();
    }).catch(() => toast({ title: "Could not remove content", description: "The existing Board permissions did not allow this action.", variant: "destructive" }));
  };

  const handleResolve = (id: number) => {
    resolveReport.mutate({ id, data: { note: resolutionNotes[id]?.trim() || undefined } }, {
      onSuccess: () => {
        setResolutionNotes((current) => ({ ...current, [id]: "" }));
        toast({ title: "Report resolved" });
        refreshSafetyData();
      },
      onError: () => toast({ title: "Could not resolve report", variant: "destructive" }),
    });
  };

  const handleRestriction = (userId: number, blocked: boolean) => {
    setRestriction.mutate({ id: userId, data: { blocked } }, {
      onSuccess: () => {
        toast({ title: blocked ? "Member blocked from posting" : "Posting restriction lifted" });
        refreshSafetyData();
      },
      onError: () => toast({ title: "Could not update posting restriction", variant: "destructive" }),
    });
  };

  const reports = reportsQuery.data ?? [];
  const blockedIds = new Set((restrictionsQuery.data ?? []).map(({ userId }) => userId));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 md:py-8" data-testid="board-reports-page">
      <header className="space-y-3">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Admin dashboard</Link>
        </Button>
        <div>
          <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Community Board reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private coach and super-admin review queue. Report notifications use in-app alerts and preference-enabled push; no report email is sent.</p>
        </div>
      </header>

      <section aria-labelledby="posting-restrictions-heading" className="space-y-3">
        <div>
          <h2 id="posting-restrictions-heading" className="text-lg font-bold">Posting restrictions</h2>
          <p className="text-sm text-muted-foreground">Restricted members can still read the Board and use the rest of the app.</p>
        </div>
        {restrictionsQuery.isLoading ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
        {restrictionsQuery.isError ? <p role="alert" className="text-sm text-destructive">Could not load posting restrictions.</p> : null}
        {!restrictionsQuery.isLoading && !restrictionsQuery.isError && !restrictionsQuery.data?.length ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No members are currently restricted.</p>
        ) : null}
        <div className="space-y-2">
          {restrictionsQuery.data?.map((member) => (
            <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0">
                <p className="font-semibold">{member.firstName} {member.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  Restricted {member.blockedAt ? formatDistanceToNow(new Date(member.blockedAt), { addSuffix: true }) : ""}
                  {member.blockedByName ? ` by ${member.blockedByName}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={setRestriction.isPending} onClick={() => handleRestriction(member.userId, false)}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Lift restriction
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="open-reports-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="open-reports-heading" className="text-lg font-bold">Open reports</h2>
            <p className="text-sm text-muted-foreground">Reports are private and stay here until resolved.</p>
          </div>
          <Badge variant="secondary">{reports.length}</Badge>
        </div>
        {reportsQuery.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-44 w-full rounded-xl" /><Skeleton className="h-44 w-full rounded-xl" /></div>
        ) : reportsQuery.isError ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Could not load reports. Try again shortly.</p>
        ) : reports.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No open Community Board reports.</CardContent></Card>
        ) : reports.map((report) => (
          <Card key={report.id} data-testid={`board-report-${report.id}`}>
            <CardHeader className="space-y-2 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flag className="h-4 w-4 text-destructive" />
                  {report.targetType === "reply" ? "Reply report" : "Discussion report"}
                  {report.isAutomatic && <Badge variant="outline">Automatic flag</Badge>}
                </CardTitle>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">Open</Badge>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</span>
                </span>
              </div>
              <CardDescription>
                <span className="font-semibold text-foreground">{report.reporterName}</span>
                {" · "}{REASONS[report.reason] ?? report.reason}
                {" · "}{report.threadTitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.contentExcerpt && (
                <blockquote className="rounded-lg border-l-4 border-primary bg-muted/40 px-3 py-2 text-sm">
                  <span className="sr-only">Reported content: </span>{report.contentExcerpt}
                </blockquote>
              )}
              {report.details && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Details: </span>{report.details}</p>}
              <div className="flex flex-wrap gap-2">
                {report.threadId && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={report.link}>Open reported content <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
                  </Button>
                )}
                {(report.threadId || report.postId) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={deleteThread.isPending || deletePost.isPending}
                    onClick={() => handleRemove(report.id, report.targetType, report.threadId, report.postId)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove content
                  </Button>
                )}
                {report.reportedUserId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setRestriction.isPending}
                    onClick={() => handleRestriction(report.reportedUserId!, !blockedIds.has(report.reportedUserId!))}
                  >
                    {blockedIds.has(report.reportedUserId) ? <ShieldCheck className="mr-2 h-3.5 w-3.5" /> : <ShieldBan className="mr-2 h-3.5 w-3.5" />}
                    {blockedIds.has(report.reportedUserId) ? "Lift posting restriction" : "Block from posting"}
                  </Button>
                )}
              </div>
              <div className="space-y-2 border-t pt-3">
                <label htmlFor={`resolution-note-${report.id}`} className="text-sm font-semibold">Resolution note (optional)</label>
                <Textarea
                  id={`resolution-note-${report.id}`}
                  value={resolutionNotes[report.id] ?? ""}
                  maxLength={1000}
                  rows={2}
                  placeholder="Add a private note for the review record."
                  onChange={(event) => setResolutionNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={resolveReport.isPending} onClick={() => handleResolve(report.id)}>
                    Mark resolved
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="resolved-reports-heading" className="space-y-3 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="resolved-reports-heading" className="text-lg font-bold">Resolved report history</h2>
            <p className="text-sm text-muted-foreground">Private, read-only records of reports staff have resolved.</p>
          </div>
          <Button
            variant="outline"
            aria-expanded={showResolvedHistory}
            aria-controls="resolved-report-history"
            onClick={() => setShowResolvedHistory((showing) => !showing)}
          >
            {showResolvedHistory ? "Hide history" : "View history"}
            {showResolvedHistory ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
        </div>
        {showResolvedHistory && (
          <div id="resolved-report-history" className="space-y-3">
            {resolvedReportsQuery.isLoading ? (
              <div className="space-y-3"><Skeleton className="h-36 w-full rounded-xl" /><Skeleton className="h-36 w-full rounded-xl" /></div>
            ) : resolvedReportsQuery.isError ? (
              <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Could not load resolved reports. Try again shortly.</p>
            ) : !resolvedReportsQuery.data?.length ? (
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No resolved Community Board reports.</CardContent></Card>
            ) : resolvedReportsQuery.data.map((report) => (
              <Card key={report.id} data-testid={`resolved-board-report-${report.id}`}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      {report.targetType === "reply" ? "Reply report" : "Discussion report"}
                      {report.isAutomatic && <Badge variant="outline">Automatic flag</Badge>}
                    </CardTitle>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">Resolved</Badge>
                      <span className="text-xs text-muted-foreground">
                        {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "Resolution date unavailable"}
                      </span>
                    </span>
                  </div>
                  <CardDescription>
                    <span className="font-semibold text-foreground">{report.reporterName}</span>
                    {" · "}{REASONS[report.reason] ?? report.reason}
                    {" · "}{report.threadTitle}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.contentExcerpt && (
                    <blockquote className="rounded-lg border-l-4 border-muted-foreground/40 bg-muted/40 px-3 py-2 text-sm">
                      <span className="sr-only">Reported content: </span>{report.contentExcerpt}
                    </blockquote>
                  )}
                  {report.details && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Details: </span>{report.details}</p>}
                  {report.resolutionNote && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Resolution note: </span>{report.resolutionNote}</p>}
                  {report.threadId && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={report.link}>Open reported content <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
