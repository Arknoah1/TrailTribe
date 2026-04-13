import { useGetEvent, useRsvpEvent } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { MapPin, Calendar as CalendarIcon, Clock, Users, Car, FileText, ChevronLeft, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEventQueryKey } from "@workspace/api-client-react";

export default function EventDetail() {
  const params = useParams();
  const eventId = parseInt(params.id || "0");
  const queryClient = useQueryClient();
  
  const { data: event, isLoading } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) }
  });

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
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{event.title}</h1>
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

          {/* Attachments if any */}
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Logistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              
              <Button variant="outline" className="w-full justify-between group">
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  Volunteers
                </div>
                <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                  {event.volunteerCount} signed up
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
