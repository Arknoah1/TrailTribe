import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetMe, useListTrailheads, useListEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { ArrowLeft, Plus, Trash2, Calendar, CheckCircle2, ChevronRight, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import { randomUUID } from "@/lib/uuid";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const EVENT_TYPES = ["practice", "race", "social", "volunteer", "other"] as const;
type EventType = (typeof EVENT_TYPES)[number];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface RowData {
  id: string;
  date: string;
  eventType: EventType;
  title: string;
  startTime: string;
  endTime: string;
  trailheadId: number | null;
}

function formatDisplayDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return WEEKDAY_LABELS[dt.getDay()];
}

function generateRows(
  titlePrefix: string,
  eventType: EventType,
  seasonStart: string,
  seasonEnd: string,
  weekdays: number[],
  startTime: string,
  endTime: string,
  trailheadId: number | null
): RowData[] {
  if (!seasonStart || !seasonEnd || weekdays.length === 0) return [];
  const rows: RowData[] = [];
  const [sy, sm, sd] = seasonStart.split("-").map(Number);
  const [ey, em, ed] = seasonEnd.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  let cur = new Date(start);
  let weekNum = 1;
  let lastWeek = -1;
  while (cur <= end) {
    const dayOfWeek = cur.getDay();
    if (weekdays.includes(dayOfWeek)) {
      const isoDate = cur.toISOString().split("T")[0];
      const weekOfYear = Math.ceil((cur.getTime() - new Date(cur.getFullYear(), 0, 1).getTime()) / 604800000);
      if (weekOfYear !== lastWeek) {
        lastWeek = weekOfYear;
        if (rows.length > 0) weekNum++;
      }
      const typeLabel = eventType.charAt(0).toUpperCase() + eventType.slice(1);
      const prefix = titlePrefix.trim() ? titlePrefix.trim() : typeLabel;
      rows.push({
        id: randomUUID(),
        date: isoDate,
        eventType,
        title: `${prefix} — Wk ${weekNum}`,
        startTime,
        endTime,
        trailheadId,
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

export default function SeasonBuilder() {
  const { data: me } = useGetMe();
  const { data: trailheads } = useListTrailheads();
  const { data: existingEvents } = useListEvents({ archived: true });
  const { toast } = useToast();
  const authedFetch = useAuthedFetch();
  const [, setLocation] = useLocation();

  const [titlePrefix, setTitlePrefix] = useState("");
  const [eventType, setEventType] = useState<EventType>("practice");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([3]); // Wed default
  const [startTime, setStartTime] = useState("15:30");
  const [endTime, setEndTime] = useState("17:00");
  const [defaultTrailheadId, setDefaultTrailheadId] = useState<number | null>(null);
  const [existingSeriesId, setExistingSeriesId] = useState<string>("new");

  const [rows, setRows] = useState<RowData[]>([]);
  const [step, setStep] = useState<"pattern" | "review">("pattern");
  const [publishing, setPublishing] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);

  const isCoach = me?.role === "coach" || me?.role === "admin";

  const existingSeries = useMemo(() => {
    const map: Record<string, { seriesId: string; label: string; count: number }> = {};
    (existingEvents ?? []).forEach(e => {
      const sid = (e as any).seriesId as string | null;
      if (sid) {
        if (!map[sid]) {
          map[sid] = {
            seriesId: sid,
            label: e.title.split(" — ")[0] || "Unnamed Series",
            count: 0,
          };
        }
        map[sid].count++;
      }
    });
    return Object.values(map);
  }, [existingEvents]);

  if (me && !isCoach) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Season Builder is only available to coaches and admins.</p>
        <Link href="/dashboard"><Button variant="outline" className="mt-4">Go Home</Button></Link>
      </div>
    );
  }

  const toggleWeekday = (day: number) => {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleGenerate = () => {
    if (!seasonStart || !seasonEnd) {
      toast({ title: "Set a season start and end date first", variant: "destructive" });
      return;
    }
    if (weekdays.length === 0) {
      toast({ title: "Select at least one day of the week", variant: "destructive" });
      return;
    }
    if (seasonStart > seasonEnd) {
      toast({ title: "Start date must be before end date", variant: "destructive" });
      return;
    }
    const generated = generateRows(titlePrefix, eventType, seasonStart, seasonEnd, weekdays, startTime, endTime, defaultTrailheadId);
    if (generated.length === 0) {
      toast({ title: "No events generated — check your date range and weekdays", variant: "destructive" });
      return;
    }
    setRows(generated);
    setStep("review");
    toast({ title: `${generated.length} events generated`, description: "Review and edit before publishing." });
  };

  const updateRow = (id: string, patch: Partial<RowData>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const addBlankRow = () => {
    const today = new Date().toISOString().split("T")[0];
    setRows(prev => [...prev, {
      id: randomUUID(),
      date: today,
      eventType,
      title: "New Event",
      startTime,
      endTime,
      trailheadId: defaultTrailheadId,
    }]);
  };

  const sortedRows = sortAsc
    ? [...rows].sort((a, b) => a.date.localeCompare(b.date))
    : [...rows].sort((a, b) => b.date.localeCompare(a.date));

  const handlePublish = async () => {
    if (rows.length === 0) {
      toast({ title: "Add at least one event", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const events = rows.map(r => {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        const [dy, dm, dd] = r.date.split("-").map(Number);
        const startDt = new Date(dy, dm - 1, dd, sh, sm);
        const endDt = new Date(dy, dm - 1, dd, eh, em);
        return {
          title: r.title,
          eventType: r.eventType,
          startTime: startDt.toISOString(),
          endTime: endDt.toISOString(),
          trailheadId: r.trailheadId,
          isAllTeam: true,
        };
      });

      const payload: { events: typeof events; seriesId?: string } = { events };
      if (existingSeriesId !== "new" && existingSeriesId) {
        payload.seriesId = existingSeriesId;
      }

      const res = await authedFetch(`${BASE_URL}/api/events/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to publish");
      toast({ title: `${rows.length} events published!`, description: "They are now visible on the calendar." });
      setLocation("/calendar");
    } catch {
      toast({ title: "Failed to publish events", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Button>
        </Link>
        <div className="h-4 border-l border-border" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Season Builder</h1>
          <p className="text-sm text-muted-foreground">Generate and publish your season schedule in bulk.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setStep("pattern")}
          className={`flex items-center gap-1.5 font-medium transition-colors ${step === "pattern" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs border ${step === "pattern" ? "bg-primary text-primary-foreground border-primary" : step === "review" ? "bg-muted border-border" : "border-border"}`}>
            {step === "review" ? <CheckCircle2 className="h-3 w-3" /> : "1"}
          </span>
          Pattern
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className={`flex items-center gap-1.5 font-medium transition-colors ${step === "review" ? "text-primary" : "text-muted-foreground"}`}>
          <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs border ${step === "review" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>2</span>
          Review &amp; Publish
        </span>
      </div>

      {/* STEP 1: PATTERN */}
      {step === "pattern" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Schedule Pattern
            </CardTitle>
            <CardDescription>Define the repeating pattern for your season events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {existingSeries.length > 0 && (
              <div className="space-y-1.5 pb-4 border-b border-border">
                <Label>Append to existing series <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select value={existingSeriesId} onValueChange={setExistingSeriesId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">— Create new series —</SelectItem>
                    {existingSeries.map(s => (
                      <SelectItem key={s.seriesId} value={s.seriesId}>
                        {s.label} ({s.count} event{s.count !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Add new events to an existing series instead of creating a brand-new one.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title Prefix <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  placeholder='e.g. "Fall Practice" or leave blank'
                  value={titlePrefix}
                  onChange={e => setTitlePrefix(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Titles will be "{titlePrefix || "Practice"} — Wk 1", etc.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Event Type</Label>
                <Select value={eventType} onValueChange={v => setEventType(v as EventType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Season Start</Label>
                <Input type="date" value={seasonStart} onChange={e => setSeasonStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Season End</Label>
                <Input type="date" value={seasonEnd} onChange={e => setSeasonEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Repeat on these days</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleWeekday(idx)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      weekdays.includes(idx)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Default Start Time</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Default End Time</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Default Trailhead <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select
                value={defaultTrailheadId !== null ? String(defaultTrailheadId) : "none"}
                onValueChange={v => setDefaultTrailheadId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No default trailhead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {trailheads?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleGenerate} className="gap-2">
                Generate Schedule <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: REVIEW GRID */}
      {step === "review" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Review Schedule</CardTitle>
                  <CardDescription>
                    {rows.length} event{rows.length !== 1 ? "s" : ""}
                    {existingSeriesId !== "new" && existingSeries.find(s => s.seriesId === existingSeriesId) && (
                      <> · adding to <strong>{existingSeries.find(s => s.seriesId === existingSeriesId)?.label}</strong></>
                    )}
                    {" — "}edit titles, times, or trailheads before publishing.
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setStep("pattern")}>
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortAsc(p => !p)}
                    className="gap-1.5"
                    title={sortAsc ? "Sort newest first" : "Sort oldest first"}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    {sortAsc ? "Oldest first" : "Newest first"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={addBlankRow} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No events. Click "Add Row" to add one manually.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-8" />
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10 hidden sm:table-cell">Day</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24 hidden md:table-cell">Start</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24 hidden md:table-cell">End</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Trailhead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedRows.map(row => (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors group">
                          <td className="pl-3 py-1.5">
                            <button
                              onClick={() => removeRow(row.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove event"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              type="date"
                              value={row.date}
                              onChange={e => updateRow(row.id, { date: e.target.value })}
                              className="h-7 text-xs w-32"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground text-xs hidden sm:table-cell">
                            {getDayLabel(row.date)}
                          </td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={row.eventType}
                              onValueChange={v => updateRow(row.id, { eventType: v as EventType })}
                            >
                              <SelectTrigger className="h-7 text-xs w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EVENT_TYPES.map(t => (
                                  <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-1.5">
                            <Input
                              value={row.title}
                              onChange={e => updateRow(row.id, { title: e.target.value })}
                              className="h-7 text-xs min-w-36"
                            />
                          </td>
                          <td className="px-3 py-1.5 hidden md:table-cell">
                            <Input
                              type="time"
                              value={row.startTime}
                              onChange={e => updateRow(row.id, { startTime: e.target.value })}
                              className="h-7 text-xs w-24"
                            />
                          </td>
                          <td className="px-3 py-1.5 hidden md:table-cell">
                            <Input
                              type="time"
                              value={row.endTime}
                              onChange={e => updateRow(row.id, { endTime: e.target.value })}
                              className="h-7 text-xs w-24"
                            />
                          </td>
                          <td className="px-3 py-1.5 hidden lg:table-cell">
                            <Select
                              value={row.trailheadId !== null ? String(row.trailheadId) : "none"}
                              onValueChange={v => updateRow(row.id, { trailheadId: v === "none" ? null : Number(v) })}
                            >
                              <SelectTrigger className="h-7 text-xs w-36">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— None —</SelectItem>
                                {trailheads?.map(t => (
                                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} event{rows.length !== 1 ? "s" : ""} ready to publish
              {existingSeriesId !== "new" && " · appending to existing series"}
            </p>
            <Button
              onClick={handlePublish}
              disabled={publishing || rows.length === 0}
              className="gap-2"
              size="lg"
            >
              <CheckCircle2 className="h-4 w-4" />
              {publishing ? "Publishing..." : `Publish ${rows.length} Event${rows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
