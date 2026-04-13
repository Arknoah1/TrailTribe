import { useListEventCarpools, useCreateCarpoolOffer, getListEventCarpoolsQueryKey, useGetMe } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Car, MapPin, Clock, Plus, Bike, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Rider {
  id: number;
  firstName: string;
  lastName: string;
}

export default function CarpoolBoard() {
  const params = useParams();
  const eventId = parseInt(params.eventId || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const { data: offers, isLoading } = useListEventCarpools(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventCarpoolsQueryKey(eventId) }
  });

  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [riders, setRiders] = useState<Rider[]>([]);

  // Claim dialog state (2+ riders)
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimingOffer, setClaimingOffer] = useState<any>(null);
  const [claimNeedsTray, setClaimNeedsTray] = useState(false);
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<number>>(new Set());
  const [isClaiming, setIsClaiming] = useState(false);

  // Edit claim dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<any>(null);
  const [editNeedsTray, setEditNeedsTray] = useState(false);

  // Fetch household riders once we know the user
  useEffect(() => {
    if (!me?.householdId) return;
    fetch(`${BASE_URL}/api/households/${me.householdId}/riders`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRiders(data); })
      .catch(() => {});
  }, [me?.householdId]);

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

  // True if the claim belongs to the current household (rider or parent)
  const isMyHouseholdClaim = (claim: any) => {
    const myRiderIds = riders.map(r => r.id);
    return myRiderIds.includes(claim.riderUserId) || claim.riderUserId === me?.id;
  };

  const handleClaimClick = (offer: any, needsTray: boolean) => {
    if (riders.length === 0) {
      claimForRiders(offer.id, [null], needsTray);
    } else if (riders.length === 1) {
      claimForRiders(offer.id, [riders[0].id], needsTray);
    } else {
      setClaimingOffer(offer);
      setClaimNeedsTray(needsTray);
      setSelectedRiderIds(new Set());
      setClaimDialogOpen(true);
    }
  };

  const claimForRiders = async (offerId: number, riderIds: (number | null)[], needsTray: boolean) => {
    setIsClaiming(true);
    let successCount = 0;
    for (const riderId of riderIds) {
      const body: any = { needsSeat: true, needsBikeTray: needsTray };
      if (riderId !== null) body.riderUserId = riderId;
      try {
        const res = await fetch(`${BASE_URL}/api/carpools/${offerId}/claims`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) successCount++;
      } catch {}
    }
    setIsClaiming(false);
    if (successCount > 0) {
      toast({ title: successCount === 1 ? "Seat claimed!" : `${successCount} seats claimed!` });
      queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      setClaimDialogOpen(false);
    } else {
      toast({ title: "Failed to claim seat", variant: "destructive" });
    }
  };

  const handleDeleteClaim = async (offerId: number, claimId: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/carpools/${offerId}/claims/${claimId}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Claim removed" });
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      } else {
        toast({ title: "Failed to remove claim", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to remove claim", variant: "destructive" });
    }
  };

  const openEditDialog = (claim: any) => {
    setEditingClaim(claim);
    setEditNeedsTray(claim.needsBikeTray);
    setEditDialogOpen(true);
  };

  const handleEditClaim = async () => {
    if (!editingClaim) return;
    try {
      const res = await fetch(
        `${BASE_URL}/api/carpools/${editingClaim.carpoolOfferId}/claims/${editingClaim.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needsSeat: true, needsBikeTray: editNeedsTray }),
        }
      );
      if (res.ok) {
        toast({ title: "Claim updated" });
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
        setEditDialogOpen(false);
      } else {
        toast({ title: "Failed to update claim", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to update claim", variant: "destructive" });
    }
  };

  const toggleRider = (id: number) => {
    setSelectedRiderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
            <Button><Plus className="h-4 w-4 mr-2" /> Offer a Ride</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Offer a Ride</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              createOffer.mutate({
                id: eventId,
                data: {
                  availableSeats: Number(fd.get("seats")),
                  bikeTrayCount: Number(fd.get("trays")),
                  departureLocation: fd.get("location") as string || undefined,
                  departureTime: fd.get("time") as string || undefined,
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

      {/* Multi-rider picker dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who needs a {claimNeedsTray ? "seat + tray" : "seat"}?</DialogTitle>
            <DialogDescription>Select the rider(s) you're claiming for.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {riders.map(rider => (
              <label key={rider.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedRiderIds.has(rider.id)}
                  onChange={() => toggleRider(rider.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">{rider.firstName} {rider.lastName}</span>
                <Bike className="h-4 w-4 text-muted-foreground ml-auto" />
              </label>
            ))}
          </div>
          <Button
            className="w-full"
            disabled={selectedRiderIds.size === 0 || isClaiming}
            onClick={() => claimForRiders(claimingOffer?.id, Array.from(selectedRiderIds), claimNeedsTray)}
          >
            {isClaiming ? "Claiming..." : `Claim for ${selectedRiderIds.size} rider${selectedRiderIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit claim dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Claim</DialogTitle>
            <DialogDescription>
              {editingClaim?.rider?.firstName} {editingClaim?.rider?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={editNeedsTray}
                onChange={e => setEditNeedsTray(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="font-medium">Needs bike tray</p>
                <p className="text-sm text-muted-foreground">Check if the rider's bike needs a tray spot</p>
              </div>
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleEditClaim}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    {offer.claims.map((claim: any) => {
                      const mine = isMyHouseholdClaim(claim);
                      return (
                        <div key={claim.id} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{claim.rider?.firstName} {claim.rider?.lastName}</span>
                          <div className="flex items-center gap-1">
                            {claim.needsSeat && <Badge variant="outline" className="text-[10px]">Seat</Badge>}
                            {claim.needsBikeTray && <Badge variant="outline" className="text-[10px]">Tray</Badge>}
                            {mine && (
                              <>
                                <button
                                  onClick={() => openEditDialog(claim)}
                                  className="ml-1 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  title="Edit claim"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteClaim(offer.id, claim.id)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                  title="Remove claim"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={offer.seatsRemaining <= 0 || isClaiming}
                    onClick={() => handleClaimClick(offer, false)}
                  >
                    Claim Seat
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={(offer.seatsRemaining <= 0 && offer.bikeTraysRemaining <= 0) || isClaiming}
                    onClick={() => handleClaimClick(offer, true)}
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
