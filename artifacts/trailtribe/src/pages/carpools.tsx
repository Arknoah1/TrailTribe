import {
  useListEventCarpools,
  useCreateCarpoolOffer,
  getListEventCarpoolsQueryKey,
  useGetMe,
  useListEventCarpoolRequests,
  useCreateCarpoolRequest,
  useUpdateCarpoolRequest,
  useDeleteCarpoolRequest,
  useMatchCarpoolRequest,
  getListEventCarpoolRequestsQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Car, MapPin, Clock, Plus, Bike, Pencil, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

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
  const authedFetch = useAuthedFetch();

  const { data: me } = useGetMe();
  const { data: offers, isLoading: offersLoading } = useListEventCarpools(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventCarpoolsQueryKey(eventId) }
  });
  const { data: requests, isLoading: requestsLoading } = useListEventCarpoolRequests(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventCarpoolRequestsQueryKey(eventId) }
  });

  const isLoading = offersLoading || requestsLoading;

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

  // Request a ride dialog
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestRiderIds, setRequestRiderIds] = useState<Set<number>>(new Set());
  const [requestNeedsTray, setRequestNeedsTray] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");

  // Edit request dialog
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [editRequestNeedsTray, setEditRequestNeedsTray] = useState(false);
  const [editRequestNotes, setEditRequestNotes] = useState("");

  // Driver "I'll take them" dialog
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchingRequest, setMatchingRequest] = useState<any>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<number | "">("");
  const [isMatching, setIsMatching] = useState(false);

  // Edit offer dialog
  const [editOfferOpen, setEditOfferOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any>(null);
  const [editOfferSeats, setEditOfferSeats] = useState(1);
  const [editOfferTrays, setEditOfferTrays] = useState(0);
  const [editOfferLocation, setEditOfferLocation] = useState("");
  const [editOfferTime, setEditOfferTime] = useState("");

  // Fetch household riders once we know the user
  useEffect(() => {
    if (!me?.householdId) return;
    authedFetch(`${BASE_URL}/api/households/${me.householdId}/riders`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRiders(data); })
      .catch(() => {});
  }, [me?.householdId, authedFetch]);

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

  const createRequest = useCreateCarpoolRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Ride request posted" });
        setIsRequestOpen(false);
        setRequestRiderIds(new Set());
        setRequestNeedsTray(false);
        setRequestNotes("");
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Failed to post request";
        toast({ title: msg, variant: "destructive" });
      }
    }
  });

  const updateRequest = useUpdateCarpoolRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Request updated" });
        setEditRequestOpen(false);
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
      },
      onError: () => toast({ title: "Failed to update request", variant: "destructive" })
    }
  });

  const deleteRequest = useDeleteCarpoolRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Request removed" });
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
      },
      onError: () => toast({ title: "Failed to remove request", variant: "destructive" })
    }
  });

  const matchRequest = useMatchCarpoolRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Matched! Claim created for the rider." });
        setMatchDialogOpen(false);
        setSelectedOfferId("");
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
        queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Failed to match request";
        toast({ title: msg, variant: "destructive" });
      }
    }
  });

  // True if the claim belongs to the current household (rider or parent)
  const isMyHouseholdClaim = (claim: any) => {
    const myRiderIds = riders.map(r => r.id);
    return myRiderIds.includes(claim.riderUserId) || claim.riderUserId === me?.id;
  };

  const isMyRequest = (request: any) => {
    return request.requestedByUserId === me?.id;
  };

  const myOpenOffers = offers?.filter((o: any) => o.driverUserId === me?.id && o.seatsRemaining > 0) ?? [];
  const myAllOffers = offers?.filter((o: any) => o.driverUserId === me?.id) ?? [];

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
        const res = await authedFetch(`${BASE_URL}/api/carpools/${offerId}/claims`, {
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
      const res = await authedFetch(`${BASE_URL}/api/carpools/${offerId}/claims/${claimId}`, { method: "DELETE" });
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
    setEditNeedsTray(!claim.needsBikeTray);
    setEditDialogOpen(true);
  };

  const handleEditClaim = async () => {
    if (!editingClaim) return;
    try {
      const res = await authedFetch(
        `${BASE_URL}/api/carpools/${editingClaim.carpoolOfferId}/claims/${editingClaim.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needsSeat: true, needsBikeTray: !editNeedsTray }),
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

  const openEditRequest = (request: any) => {
    setEditingRequest(request);
    setEditRequestNeedsTray(!request.needsBikeTray);
    setEditRequestNotes(request.notes ?? "");
    setEditRequestOpen(true);
  };

  const handleMatchClick = (request: any) => {
    setMatchingRequest(request);
    setSelectedOfferId(myAllOffers.length === 1 ? myAllOffers[0].id : "");
    setMatchDialogOpen(true);
  };

  const handleTakeThem = async () => {
    if (!matchingRequest) return;
    setIsMatching(true);
    try {
      let offerId = selectedOfferId as number;
      if (myAllOffers.length === 0) {
        const seats = me?.defaultCarpoolSeats ?? 1;
        const trays = me?.defaultCarpoolTrays ?? 1;
        const res = await authedFetch(`${BASE_URL}/api/events/${eventId}/carpools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ availableSeats: seats, bikeTrayCount: trays }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast({ title: d.error || "Failed to create offer", variant: "destructive" });
          return;
        }
        const newOffer = await res.json();
        offerId = newOffer.id;
      } else if (selectedOfferId) {
        offerId = selectedOfferId as number;
      } else {
        offerId = myAllOffers[0].id;
      }
      const matchRes = await authedFetch(`${BASE_URL}/api/carpool-requests/${matchingRequest.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      if (!matchRes.ok) {
        const d = await matchRes.json().catch(() => ({}));
        toast({ title: d.error || "Failed to match", variant: "destructive" });
        return;
      }
      toast({ title: `You're picking up ${matchingRequest.rider?.firstName ?? "them"}!` });
      setMatchDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
      queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setIsMatching(false);
    }
  };

  const openEditOffer = (offer: any) => {
    setEditingOffer(offer);
    setEditOfferSeats(offer.availableSeats);
    setEditOfferTrays(offer.bikeTrayCount);
    setEditOfferLocation(offer.departureLocation ?? "");
    setEditOfferTime(offer.departureTime ?? "");
    setEditOfferOpen(true);
  };

  const handleEditOffer = async () => {
    if (!editingOffer) return;
    const res = await authedFetch(`${BASE_URL}/api/carpools/${editingOffer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availableSeats: editOfferSeats,
        bikeTrayCount: editOfferTrays,
        departureLocation: editOfferLocation || undefined,
        departureTime: editOfferTime || undefined,
      }),
    });
    if (res.ok) {
      toast({ title: "Offer updated" });
      setEditOfferOpen(false);
      queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
    } else {
      toast({ title: "Failed to update offer", variant: "destructive" });
    }
  };

  const handleDeleteOffer = async (offerId: number) => {
    const res = await authedFetch(`${BASE_URL}/api/carpools/${offerId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast({ title: "Offer removed" });
      queryClient.invalidateQueries({ queryKey: getListEventCarpoolsQueryKey(eventId) });
    } else {
      toast({ title: "Failed to delete offer", variant: "destructive" });
    }
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
                  <Input type="number" name="seats" min="1" required defaultValue={me?.defaultCarpoolSeats ?? 3} key={`seats-${me?.defaultCarpoolSeats}`} />
                </div>
                <div className="space-y-2">
                  <Label>Bike Trays</Label>
                  <Input type="number" name="trays" min="0" required defaultValue={me?.defaultCarpoolTrays ?? 2} key={`trays-${me?.defaultCarpoolTrays}`} />
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
            <DialogTitle>Who needs a ride{claimNeedsTray ? " + bike" : ""}?</DialogTitle>
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
                <p className="font-medium">Rider only</p>
                <p className="text-sm text-muted-foreground">Check if no bike transport is needed</p>
              </div>
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleEditClaim}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request a ride dialog */}
      <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a Ride</DialogTitle>
            <DialogDescription>Post a ride request so a driver can pick up your rider.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (requestRiderIds.size === 0) {
                toast({ title: "Please select at least one rider", variant: "destructive" });
                return;
              }
              const selectedRiders = riders.filter(r => requestRiderIds.has(r.id));
              try {
                for (const rider of selectedRiders) {
                  const res = await authedFetch(`${BASE_URL}/api/events/${eventId}/carpool-requests`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ riderUserId: rider.id, needsBikeTray: !requestNeedsTray, notes: requestNotes || undefined }),
                  });
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    toast({ title: d.error || "Failed to post a request", variant: "destructive" });
                    return;
                  }
                }
                toast({ title: selectedRiders.length === 1 ? "Ride request posted" : `${selectedRiders.length} ride requests posted` });
                setIsRequestOpen(false);
                setRequestRiderIds(new Set());
                setRequestNeedsTray(false);
                setRequestNotes("");
                queryClient.invalidateQueries({ queryKey: getListEventCarpoolRequestsQueryKey(eventId) });
              } catch {
                toast({ title: "Failed to post requests", variant: "destructive" });
              }
            }}
            className="space-y-4"
          >
            {riders.length > 0 && (
              <div className="space-y-2">
                <Label>Rider{riders.length > 1 ? "s" : ""}</Label>
                <div className="space-y-2">
                  {riders.map(r => (
                    <label key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${requestRiderIds.has(r.id) ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}>
                      <input
                        type="checkbox"
                        checked={requestRiderIds.has(r.id)}
                        onChange={() => {
                          setRequestRiderIds(prev => {
                            const next = new Set(prev);
                            next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="font-medium">{r.firstName} {r.lastName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={requestNeedsTray}
                onChange={e => setRequestNeedsTray(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="font-medium">Rider only</p>
                <p className="text-sm text-muted-foreground">Check if no bike transport is needed</p>
              </div>
            </label>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any details for the driver..."
                value={requestNotes}
                onChange={e => setRequestNotes(e.target.value)}
                rows={3}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createRequest.isPending}>
              {createRequest.isPending ? "Posting..." : "Post Request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit request dialog */}
      <Dialog open={editRequestOpen} onOpenChange={setEditRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ride Request</DialogTitle>
            <DialogDescription>
              {editingRequest?.rider?.firstName} {editingRequest?.rider?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={editRequestNeedsTray}
                onChange={e => setEditRequestNeedsTray(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="font-medium">Rider only</p>
                <p className="text-sm text-muted-foreground">Check if no bike transport is needed</p>
              </div>
            </label>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any details for the driver..."
                value={editRequestNotes}
                onChange={e => setEditRequestNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditRequestOpen(false)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={updateRequest.isPending}
              onClick={() => {
                if (!editingRequest) return;
                updateRequest.mutate({
                  id: editingRequest.id,
                  data: { needsBikeTray: !editRequestNeedsTray, notes: editRequestNotes || undefined }
                });
              }}
            >
              {updateRequest.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Driver match dialog */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take This Rider</DialogTitle>
            <DialogDescription>
              Confirm you'll pick up {matchingRequest?.rider?.firstName} {matchingRequest?.rider?.lastName}.
              A seat will be claimed under your offer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {myAllOffers.length === 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                You don't have an offer for this event yet. Confirming will automatically create one for you.
              </p>
            )}
            {myAllOffers.length > 1 && (
              <div className="space-y-2">
                <Label>Which of your offers?</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={selectedOfferId}
                  onChange={e => setSelectedOfferId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">Select an offer...</option>
                  {myAllOffers.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.seatsRemaining} seat{o.seatsRemaining !== 1 ? "s" : ""} remaining
                      {o.departureLocation ? ` · ${o.departureLocation}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setMatchDialogOpen(false)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={isMatching || (myAllOffers.length > 1 && selectedOfferId === "")}
              onClick={handleTakeThem}
            >
              {isMatching ? "Confirming..." : "I'll Take Them"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit offer dialog */}
      <Dialog open={editOfferOpen} onOpenChange={setEditOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Your Offer</DialogTitle>
            <DialogDescription>Update the details of your carpool offer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Available Seats</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={editOfferSeats}
                  onChange={e => setEditOfferSeats(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bike Trays</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={editOfferTrays}
                  onChange={e => setEditOfferTrays(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Departure Location (optional)</Label>
              <Input
                placeholder="e.g. School parking lot"
                value={editOfferLocation}
                onChange={e => setEditOfferLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Departure Time (optional)</Label>
              <Input
                placeholder="e.g. 3:15 PM"
                value={editOfferTime}
                onChange={e => setEditOfferTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOfferOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleEditOffer}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── RIDES AVAILABLE ─────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" /> Rides Available
        </h2>
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
                    <div className="flex items-center gap-2">
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
                      {offer.driverUserId === me?.id && (
                        <div className="flex flex-col gap-1 ml-1">
                          <button
                            onClick={() => openEditOffer(offer)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit offer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteOffer(offer.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                            title="Delete offer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
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
                              {claim.needsBikeTray && <Badge variant="outline" className="text-[10px]">+ Bike</Badge>}
                              {!claim.needsBikeTray && <Badge variant="outline" className="text-[10px]">Rider only</Badge>}
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
                      disabled={(offer.seatsRemaining <= 0 && offer.bikeTraysRemaining <= 0) || isClaiming}
                      onClick={() => handleClaimClick(offer, true)}
                    >
                      Seat + Bike
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={offer.seatsRemaining <= 0 || isClaiming}
                      onClick={() => handleClaimClick(offer, false)}
                    >
                      Rider only
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

      {/* ── RIDES NEEDED ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Rides Needed
          </h2>
          <Button variant="outline" size="sm" onClick={() => {
            setRequestRiderIds(new Set(riders.map(r => r.id)));
            setIsRequestOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" /> Request a Ride
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests && requests.length > 0 ? (
            requests.map((request: any) => {
              const isOpen = request.status === "open";
              const isMatched = request.status === "matched";
              const mine = isMyRequest(request);
              const canMatch = isOpen && !mine && me?.role !== "rider";

              return (
                <Card key={request.id} className={isMatched ? "border-green-500/40 bg-green-50/30 dark:bg-green-950/10" : ""}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-base">
                          {request.rider?.firstName} {request.rider?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Requested by {request.requestedBy?.firstName} {request.requestedBy?.lastName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {isOpen && <Badge variant="secondary">Open</Badge>}
                        {isMatched && <Badge className="bg-green-600 text-white hover:bg-green-700">Matched</Badge>}
                        {request.needsBikeTray && (
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                            <Bike className="h-3 w-3" /> + Bike
                          </Badge>
                        )}
                        {!request.needsBikeTray && (
                          <Badge variant="outline" className="text-[10px]">Rider only</Badge>
                        )}
                      </div>
                    </div>

                    {request.notes && (
                      <p className="text-sm text-muted-foreground italic">"{request.notes}"</p>
                    )}

                    {isMatched && request.matchedOffer?.driver && (
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-100/60 dark:bg-green-900/20 rounded-md px-3 py-2">
                        <Car className="h-4 w-4 shrink-0" />
                        <span>Driver: <span className="font-medium">{request.matchedOffer.driver.firstName} {request.matchedOffer.driver.lastName}</span></span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {canMatch && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleMatchClick(request)}
                        >
                          I'll take them
                        </Button>
                      )}
                      {mine && isOpen && (
                        <>
                          <button
                            onClick={() => openEditRequest(request)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit request"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteRequest.mutate({ id: request.id })}
                            className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                            title="Delete request"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="col-span-full text-center p-12 border rounded-lg bg-card">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No ride requests yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                Need a ride to this event? Post a request and a driver will match you.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
