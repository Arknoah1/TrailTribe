import { useListEventCarpools, useCreateCarpoolOffer, useClaimCarpool, useCancelCarpoolClaim, getListEventCarpoolsQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Car, MapPin, Clock, Users, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CarpoolBoard() {
  const params = useParams();
  const eventId = parseInt(params.eventId || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOfferOpen, setIsOfferOpen] = useState(false);

  const { data: offers, isLoading } = useListEventCarpools(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventCarpoolsQueryKey(eventId) }
  });

  const createOffer = useCreateCarpoolOffer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Carpool offer created" });
        setIsOfferOpen(false);
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      },
      onError: () => toast({ title: "Failed to create offer", variant: "destructive" })
    }
  });

  const claimSeat = useClaimCarpool({
    mutation: {
      onSuccess: () => {
        toast({ title: "Seat claimed!" });
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      },
      onError: () => toast({ title: "Failed to claim seat", variant: "destructive" })
    }
  });

  if (isLoading) return <div className="p-8 text-center">Loading carpools...</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link href={`/events/${eventId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Event
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carpool Board</h1>
          <p className="text-muted-foreground mt-1">Offer a ride or grab a seat.</p>
        </div>
        <Dialog open={isOfferOpen} onOpenChange={setIsOfferOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Offer a Ride
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Offer a Ride</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createOffer.mutate({
                id: eventId,
                data: {
                  availableSeats: Number(formData.get("seats")),
                  bikeTrayCount: Number(formData.get("trays")),
                  departureLocation: formData.get("location") as string || undefined,
                  departureTime: formData.get("time") as string || undefined,
                }
              });
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Available Seats</Label>
                  <Input type="number" name="seats" min="1" required defaultValue="3" />
                </div>
                <div className="space-y-2">
                  <Label>Bike Trays</Label>
                  <Input type="number" name="trays" min="0" required defaultValue="2" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Departure Location (Optional)</Label>
                <Input name="location" placeholder="e.g. High School parking lot" />
              </div>
              <div className="space-y-2">
                <Label>Departure Time (Optional)</Label>
                <Input name="time" placeholder="e.g. 3:15 PM" />
              </div>
              <Button type="submit" className="w-full" disabled={createOffer.isPending}>
                {createOffer.isPending ? "Creating..." : "Create Offer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offers && offers.length > 0 ? (
          offers.map(offer => (
            <Card key={offer.id}>
              <CardHeader className="pb-3 border-b">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{offer.driver?.firstName} {offer.driver?.lastName}</CardTitle>
                      <CardDescription>Driving</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2 text-center">
                    <div className="bg-muted px-3 py-1 rounded-md">
                      <div className="text-lg font-bold">{offer.seatsRemaining}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Seats</div>
                    </div>
                    <div className="bg-muted px-3 py-1 rounded-md">
                      <div className="text-lg font-bold">{offer.bikeTraysRemaining}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trays</div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {(offer.departureLocation || offer.departureTime) && (
                  <div className="space-y-2 text-sm">
                    {offer.departureLocation && (
                      <div className="flex items-center text-muted-foreground">
                        <MapPin className="h-4 w-4 mr-2" /> {offer.departureLocation}
                      </div>
                    )}
                    {offer.departureTime && (
                      <div className="flex items-center text-muted-foreground">
                        <Clock className="h-4 w-4 mr-2" /> {offer.departureTime}
                      </div>
                    )}
                  </div>
                )}
                
                {offer.claims && offer.claims.length > 0 && (
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Riders</h4>
                    {offer.claims.map(claim => (
                      <div key={claim.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{claim.rider?.firstName} {claim.rider?.lastName}</span>
                        <div className="flex gap-1">
                          {claim.needsSeat && <Badge variant="outline" className="text-[10px]">Seat</Badge>}
                          {claim.needsBikeTray && <Badge variant="outline" className="text-[10px]">Tray</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    disabled={offer.seatsRemaining <= 0 || claimSeat.isPending}
                    onClick={() => claimSeat.mutate({ id: offer.id, data: { needsSeat: true, needsBikeTray: false } })}
                  >
                    Claim Seat
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    disabled={(offer.seatsRemaining <= 0 && offer.bikeTraysRemaining <= 0) || claimSeat.isPending}
                    onClick={() => claimSeat.mutate({ id: offer.id, data: { needsSeat: true, needsBikeTray: true } })}
                  >
                    Seat + Tray
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center p-12 border rounded-lg bg-card">
            <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No carpools yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-2">
              No one has offered a ride for this event yet. Be the first to offer a ride!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
