import { useGetEvent, useRsvpEvent, useUpdateEvent, useGetMe, useListTrailheads, useListPods } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { MapPin, Calendar as CalendarIcon, Clock, Users, Car, FileText, ChevronLeft, Map, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEventQueryKey, getListEventsQueryKey, UpdateEventBodyEventType } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const EVENT_TYPES = Object.values(UpdateEventBodyEventType) as string[];

export default function EventDetail() {
  const params = useParams();
  const eventId = parseInt(params.id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: event, isLoading } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) }
  });
  const { data: me } = useGetMe();
  const { data: trailheads } = useListTrailheads();
  const { data: pods } = useListPods();
  const updateEvent = useUpdateEvent();

  const isCoach = me?.role === "coach" || me?.role === "admin";

  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState<{
    title: string;
    description: string;
    eventType: string;
    startDate: string;
    startTime: string;
    endTime: string;
    trailheadId: string;
    isAllTeam: boolean;
    podId: string;
  }>({
    title: "", description: "", eventType: "practice",
    startDate: "", startTime: "", endTime: "",
    trailheadId: "", isAllTeam: true, podId: "",
  });

  const openEdit = () => {
    if (!event) return;
    const startDt = new Date(event.startTime);
    const endDt = event.endTime ? new Date(event.endTime) : null;
    setEditData({
      title: event.title,
      description: event.description ?? "",
      eventType: event.eventType,
      startDate: startDt.toISOString().split("T")[0],
      startTime: startDt.toTimeString().slice(0, 5),
      endTime: endDt ? endDt.toTimeString().slice(0, 5) : "",
      trailheadId: event.trailhead ? String(event.trailhead.id) : "",
      isAllTeam: event.isAllTeam ?? true,
      podId: "",
    });
    setShowEdit(true);
  };

  const handleSave = () => {
    if (!editData.title.trim() || !editData.startDate || !editData.startTime) {
      toast({ title: "Title, date, and start time are required", variant: "destructive" });
      return;
    }
    if (!editData.isAllTeam && !editData.podId) {
      toast({ title: "Select a pod, or check All Team", variant: "destructive" });
      return;
    }
    const [y, m, d] = editData.startDate.split("-").map(Number);
    const [h, min] = editData.startTime.split(":").map(Number);
    const startDt = new Date(y, m - 1, d, h, min);
    let endDt: Date | null = null;
    if (editData.endTime) {
      const [eh, emin] = editData.endTime.split(":").map(Number);
      endDt = new Date(y, m - 1, d, eh, emin);
    }
    updateEvent.mutate({
      id: eventId,
      data: {
        title: editData.title.trim(),
        ...(editData.description.trim() ? { description: editData.description.trim() } : { description: "" }),
        eventType: editData.eventType as UpdateEventBodyEventType,
        startTime: startDt.toISOString(),
        ...(endDt ? { endTime: endDt.toISOString() } : { endTime: undefined }),
        ...(editData.trailheadId ? { trailheadId: Number(editData.trailheadId) } : { trailheadId: undefined }),
        isAllTeam: editData.isAllTeam,
        ...(!editData.isAllTeam && editData.podId ? { podIds: [editData.podId] } : {}),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Event updated" });
        setShowEdit(false);
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      },
      onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
    });
  };

  const rsvpMutation = useRsvpEvent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      }
    }
  });

  const handleRsvp = (status: "attending" | "not_attending" | "maybe") => {
    rsvpMutation.mutate({ id: eventId, data: { status } });
  };

  if (isLoading) return <div className="p-8 text-center">Loading event...</div>;
  if (!event) return <div className="p-8 text-center text-destructive">Event not found</div>;

  const mapUrl = event.googleMapsUrlOverride || event.trailhead?.googleMapsUrl;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link href="/calendar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Calendar
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge className="uppercase tracking-wider font-semibold">{event.eventType}</Badge>
          {event.isAllTeam && <Badge variant="outline">All Team</Badge>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{event.title}</h1>
          {isCoach && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 mt-1"
              onClick={openEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Event
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-medium">{format(new Date(event.startTime), "EEEE, MMMM d, yyyy")}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(event.startTime), "h:mm a")} 
                    {event.endTime && ` - ${format(new Date(event.endTime), "h:mm a")}`}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-4 border-t">
                <MapPin className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">{event.locationOverride || event.trailhead?.name || "TBD"}</div>
                  {event.trailhead?.address && (
                    <div className="text-sm text-muted-foreground">{event.trailhead.address}</div>
                  )}
                  {mapUrl && (
                    <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" asChild>
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                        <Map className="h-4 w-4 mr-2" /> Open in Google Maps
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              {event.description && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-2">Details</h3>
                  <div className="text-sm prose dark:prose-invert max-w-none">
                    {event.description}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {event.attachments && event.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Files & Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {event.attachments.map(att => (
                    <a key={att.id} href={`/api/storage${att.objectPath}`} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 rounded-lg border hover:bg-muted transition-colors">
                      <FileText className="h-5 w-5 mr-3 text-muted-foreground" />
                      <span className="font-medium text-sm">{att.label}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Your RSVP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button 
                  variant={event.myRsvp === "attending" ? "default" : "outline"} 
                  className="w-full justify-start"
                  onClick={() => handleRsvp("attending")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "attending" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Going
                </Button>
                <Button 
                  variant={event.myRsvp === "not_attending" ? "destructive" : "outline"} 
                  className="w-full justify-start"
                  onClick={() => handleRsvp("not_attending")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "not_attending" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Not Going
                </Button>
                <Button 
                  variant={event.myRsvp === "maybe" ? "secondary" : "outline"} 
                  className="w-full justify-start"
                  onClick={() => handleRsvp("maybe")}
                  disabled={rsvpMutation.isPending}
                >
                  <div className="w-4 h-4 rounded-full border border-current mr-3 flex items-center justify-center">
                    {event.myRsvp === "maybe" && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  Maybe
                </Button>
              </div>
              
              <div className="mt-6 pt-4 border-t border-border/50 text-sm flex justify-between text-muted-foreground">
                <span>{event.rsvpCounts.attending} Going</span>
                <span>{event.rsvpCounts.maybe} Maybe</span>
                <span>{event.rsvpCounts.notAttending} Not</span>
              </div>
            </CardContent>
          </Card>

          {["practice", "race", "social"].includes(event.eventType) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Logistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {["practice", "race"].includes(event.eventType) && (
                  <Link href={`/carpools/${event.id}`}>
                    <Button variant="outline" className="w-full justify-between group">
                      <div className="flex items-center">
                        <Car className="h-4 w-4 mr-2 text-muted-foreground" />
                        Carpools
                      </div>
                      <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {event.carpoolSpotsAvailable > 0 ? `${event.carpoolSpotsAvailable} spots` : 'View'}
                      </span>
                    </Button>
                  </Link>
                )}

                {["race", "social"].includes(event.eventType) && (
                  <Button variant="outline" className="w-full justify-between group">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                      Volunteers
                    </div>
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                      {event.volunteerCount} signed up
                    </span>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Title *</Label>
              <Input
                value={editData.title}
                onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                placeholder="Event title"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={editData.description}
                onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g. Early season skills — bring snacks"
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Type *</Label>
              <Select value={editData.eventType} onValueChange={v => setEditData(p => ({ ...p, eventType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Date *</Label>
              <Input
                type="date"
                value={editData.startDate}
                onChange={e => setEditData(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Start time *</Label>
              <Input
                type="time"
                value={editData.startTime}
                onChange={e => setEditData(p => ({ ...p, startTime: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">End time <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="time"
                value={editData.endTime}
                onChange={e => setEditData(p => ({ ...p, endTime: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-sm">Trailhead <span className="text-muted-foreground">(optional)</span></Label>
              <Select
                value={editData.trailheadId || "_none"}
                onValueChange={v => setEditData(p => ({ ...p, trailheadId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(trailheads ?? []).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label className="text-sm">Pod assignment</Label>
              <div className="flex items-center gap-2">
                <input
                  id="edit-event-all-team"
                  type="checkbox"
                  checked={editData.isAllTeam}
                  onChange={e => setEditData(p => ({ ...p, isAllTeam: e.target.checked, podId: "" }))}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <label htmlFor="edit-event-all-team" className="text-sm cursor-pointer select-none">All Team</label>
              </div>
              {!editData.isAllTeam && (
                <Select
                  value={editData.podId || "_none"}
                  onValueChange={v => setEditData(p => ({ ...p, podId: v === "_none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select a pod..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— select a pod —</SelectItem>
                    {(pods ?? []).map(pod => (
                      <SelectItem key={pod.id} value={String(pod.id)}>{pod.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={updateEvent.isPending}
            >
              {updateEvent.isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEdit(false)}
              disabled={updateEvent.isPending}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
