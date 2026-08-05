import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { Archive, Download, Plus, CheckCircle2, XCircle, ChevronDown, ChevronUp, Calendar, Users, Mail } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Season {
  id: number;
  name: string;
  status: "active" | "closed";
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

interface HouseholdRow {
  id: number;
  name: string;
  podId: string | null;
  pod: { id: number; name: string } | null;
  seasonEnrolled: boolean;
  liabilityWaiverSigned: boolean;
  mediaReleaseSigned: boolean;
  codeOfConductSigned: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  lastReminderSentAt: string | null;
  members: { id: number; firstName: string; lastName: string; role: string }[];
}

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function reminderCooldownActive(lastReminderSentAt: string | null): boolean {
  if (!lastReminderSentAt) return false;
  return Date.now() - new Date(lastReminderSentAt).getTime() < REMINDER_COOLDOWN_MS;
}

function reminderCooldownLabel(lastReminderSentAt: string | null): string {
  if (!lastReminderSentAt) return "";
  const remainingMs = REMINDER_COOLDOWN_MS - (Date.now() - new Date(lastReminderSentAt).getTime());
  if (remainingMs <= 0) return "";
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  return `Sent ${hours}h ago`;
}

export default function SeasonsTab() {
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  // New season form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [autoEnroll, setAutoEnroll] = useState(false);
  const [creating, setCreating] = useState(false);

  // Close season confirm
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  // Re-enrollment reminder (bulk)
  const [sendingReminder, setSendingReminder] = useState(false);

  // Returning families list (active season, not yet enrolled)
  const [returningHouseholds, setReturningHouseholds] = useState<HouseholdRow[]>([]);
  const [returningLoading, setReturningLoading] = useState(false);
  const [remindingIds, setRemindingIds] = useState<Set<number>>(new Set());

  // Archived roster expand
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rosterBySeasonId, setRosterBySeasonId] = useState<Record<number, HouseholdRow[]>>({});
  const [rosterLoading, setRosterLoading] = useState<number | null>(null);

  const fetchSeasons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons`);
      if (res.ok) setSeasons(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => { fetchSeasons(); }, [fetchSeasons]);

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;
  const archivedSeasons = seasons.filter((s) => s.status === "closed");

  useEffect(() => {
    if (!activeSeason) {
      setReturningHouseholds([]);
      return;
    }

    fetchReturningHouseholds(activeSeason);

    // Re-fetch every 30 seconds so enrolled families disappear without a manual refresh
    const interval = setInterval(() => {
      fetchReturningHouseholds(activeSeason);
    }, 30_000);

    // Also re-fetch whenever the coach switches back to this browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchReturningHouseholds(activeSeason);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeason?.id]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), startDate: newStartDate, autoEnrollExisting: autoEnroll }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Failed to create season", variant: "destructive" });
        return;
      }
      toast({ title: `Season "${newName.trim()}" started` });
      setShowNewForm(false);
      setNewName("");
      setAutoEnroll(false);
      fetchSeasons();
    } catch {
      toast({ title: "Failed to create season", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = async () => {
    if (!closingId) return;
    setClosing(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons/${closingId}/close`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Failed to close season", variant: "destructive" });
        return;
      }
      toast({ title: "Season closed. Compliance docs and enrollment have been reset." });
      fetchSeasons();
    } catch {
      toast({ title: "Failed to close season", variant: "destructive" });
    } finally {
      setClosing(false);
      setClosingId(null);
    }
  };

  const handleDownloadCsv = async (season: Season) => {
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons/${season.id}/export.csv`);
      if (!res.ok) { toast({ title: "Export failed", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${season.name.replace(/[^a-z0-9]/gi, "-")}-roster.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleSendReminder = async () => {
    setSendingReminder(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons/active/remind-returning`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to send reminders", variant: "destructive" });
        return;
      }
      if (!data.householdsTargeted) {
        toast({ title: data.message ?? "No reminders needed — all returning families have enrolled" });
      } else {
        const n = data.householdsTargeted;
        toast({ title: `Reminder sent to ${n} returning ${n === 1 ? "family" : "families"}` });
      }
    } catch {
      toast({ title: "Failed to send reminders", variant: "destructive" });
    } finally {
      setSendingReminder(false);
    }
  };

  const fetchReturningHouseholds = useCallback(async (season: Season) => {
    setReturningLoading(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons/${season.id}/roster`);
      if (res.ok) {
        const data: HouseholdRow[] = await res.json();
        const seasonStart = new Date(season.startDate);
        const returning = data.filter(
          (h) => !h.seasonEnrolled && new Date(h.createdAt) < seasonStart
        );
        setReturningHouseholds(returning);
      }
    } catch {}
    finally { setReturningLoading(false); }
  }, [authedFetch]);

  const handleRemindHousehold = async (householdId: number, familyName: string) => {
    setRemindingIds((prev) => new Set(prev).add(householdId));
    try {
      const res = await authedFetch(
        `${BASE_URL}/api/seasons/active/remind-returning/${householdId}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? `Failed to send reminder to ${familyName}`, variant: "destructive" });
      } else {
        toast({ title: `Reminder sent to ${familyName}` });
        // Update local state so the button reflects the cooldown immediately
        setReturningHouseholds((prev) =>
          prev.map((h) =>
            h.id === householdId ? { ...h, lastReminderSentAt: new Date().toISOString() } : h
          )
        );
      }
    } catch {
      toast({ title: `Failed to send reminder to ${familyName}`, variant: "destructive" });
    } finally {
      setRemindingIds((prev) => { const s = new Set(prev); s.delete(householdId); return s; });
    }
  };

  const handleExpandRoster = async (seasonId: number) => {
    if (expandedId === seasonId) { setExpandedId(null); return; }
    setExpandedId(seasonId);
    if (rosterBySeasonId[seasonId]) return; // already loaded
    setRosterLoading(seasonId);
    try {
      const res = await authedFetch(`${BASE_URL}/api/seasons/${seasonId}/roster?showAll=true`);
      if (res.ok) {
        const data = await res.json();
        setRosterBySeasonId((prev) => ({ ...prev, [seasonId]: data }));
      }
    } catch {}
    finally { setRosterLoading(null); }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Loading seasons…</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Active season ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current Season</h2>
          {!activeSeason && !showNewForm && (
            <Button size="sm" onClick={() => setShowNewForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Start Season
            </Button>
          )}
        </div>

        {activeSeason ? (
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-xl">{activeSeason.name}</h3>
                    <Badge className="bg-green-600/15 text-green-700 border-green-600/30 hover:bg-green-600/15">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Started {fmtDate(activeSeason.startDate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleDownloadCsv(activeSeason)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSendReminder}
                    disabled={sendingReminder}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    {sendingReminder ? "Sending…" : "Send Re-enrollment Reminder"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setClosingId(activeSeason.id)}
                  >
                    <Archive className="h-3.5 w-3.5 mr-1.5" /> Close Season
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Returning families not yet enrolled ── */}
        {activeSeason && (returningLoading || returningHouseholds.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Returning Families — Not Yet Enrolled</CardTitle>
                  <CardDescription className="mt-0.5">
                    {returningLoading
                      ? "Loading…"
                      : `${returningHouseholds.length} ${returningHouseholds.length === 1 ? "household" : "households"} from last season haven't re-enrolled yet`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {returningLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
              ) : (
                <div className="space-y-1">
                  {returningHouseholds.map((h) => {
                    const riders = h.members.filter((m) => m.role === "student");
                    const isSending = remindingIds.has(h.id);
                    const onCooldown = reminderCooldownActive(h.lastReminderSentAt);
                    const cooldownLabel = reminderCooldownLabel(h.lastReminderSentAt);
                    return (
                      <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{h.name}</span>
                          {riders.length > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                              · {riders.map((r) => r.firstName).join(", ")}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0 ml-2"
                          disabled={isSending || onCooldown}
                          title={onCooldown ? `Reminder already sent. ${cooldownLabel} — wait 24 h before sending another.` : undefined}
                          onClick={() => handleRemindHousehold(h.id, h.name)}
                        >
                          <Mail className="h-3 w-3 mr-1" />
                          {isSending ? "Sending…" : onCooldown ? cooldownLabel : "Remind"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!activeSeason && showNewForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Start a New Season</CardTitle>
              <CardDescription>Pod assignments start fresh — coaches assign families after they re-enroll.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Season name *</label>
                  <Input
                    placeholder="e.g. 2025–2026"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start date</label>
                  <Input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEnroll}
                  onChange={(e) => setAutoEnroll(e.target.checked)}
                  className="mt-0.5 rounded accent-primary"
                />
                <span className="text-sm">
                  <span className="font-medium">Auto-enroll returning families</span>
                  <span className="block text-muted-foreground text-xs mt-0.5">
                    Mark all currently-approved households as enrolled so they appear on the active roster without re-registering. Useful when migrating an existing team into TrailTribe.
                  </span>
                </span>
              </label>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating}>
                  {creating ? "Starting…" : "Start Season"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowNewForm(false); setNewName(""); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!activeSeason && !showNewForm && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No active season. Start one to track enrollment and roster data.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Archived seasons ── */}
      {archivedSeasons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Past Seasons</h2>
          <div className="space-y-2">
            {archivedSeasons.map((season) => {
              const isExpanded = expandedId === season.id;
              const rosterRows: HouseholdRow[] = rosterBySeasonId[season.id] ?? [];
              const enrolled = rosterRows.filter((h) => h.seasonEnrolled);
              const didNotReturn = rosterRows.filter((h) => !h.seasonEnrolled);
              const compliant = rosterRows.filter(
                (h) => h.liabilityWaiverSigned && h.mediaReleaseSigned && h.codeOfConductSigned
              );

              return (
                <Card key={season.id}>
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer select-none"
                    onClick={() => handleExpandRoster(season.id)}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{season.name}</span>
                        <Badge variant="secondary" className="text-xs font-normal">Archived</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(season.startDate)} → {fmtDate(season.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleDownloadCsv(season); }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> CSV
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-4">
                      {rosterLoading === season.id ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">Loading roster…</p>
                      ) : (
                        <>
                          {/* Summary stats */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                              <div className="text-2xl font-bold">{enrolled.length}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                                <Users className="h-3 w-3" /> Enrolled
                              </div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                              <div className="text-2xl font-bold">{didNotReturn.length}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">Did not return</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                              <div className="text-2xl font-bold">{rosterRows.length > 0 ? Math.round((compliant.length / rosterRows.length) * 100) : 0}%</div>
                              <div className="text-xs text-muted-foreground mt-0.5">Compliance</div>
                            </div>
                          </div>

                          {/* Household list */}
                          <div className="space-y-1">
                            {rosterRows.map((h) => {
                              const riders = h.members.filter((m) => m.role === "student");
                              const isCompliant = h.liabilityWaiverSigned && h.mediaReleaseSigned && h.codeOfConductSigned;
                              return (
                                <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 text-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-medium truncate">{h.name}</span>
                                    {h.pod && <Badge variant="secondary" className="text-xs font-normal shrink-0">{h.pod.name}</Badge>}
                                    {!h.seasonEnrolled && (
                                      <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30 shrink-0">Did not return</Badge>
                                    )}
                                    {riders.length > 0 && (
                                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                                        · {riders.map((r) => r.firstName).join(", ")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {isCompliant
                                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                      : <XCircle className="h-4 w-4 text-muted-foreground/30" />
                                    }
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Close season confirm dialog ── */}
      <AlertDialog open={!!closingId} onOpenChange={(open) => { if (!open) setClosingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this season?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Closing the season will:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Archive the current roster as a read-only snapshot</li>
                <li>Reset all compliance documents — families will need to re-sign next season</li>
                <li>Mark all families as not yet enrolled for the new season</li>
                <li>Remove pod assignments — coaches re-assign as families re-enroll</li>
              </ul>
              <p className="font-medium text-foreground mt-2">This cannot be undone. Download a CSV backup first if you haven't already.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? "Closing…" : "Close Season"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
