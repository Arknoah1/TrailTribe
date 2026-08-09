import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mountain, Bike, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type Status = "loading" | "invalid" | "ready" | "accepting" | "done" | "already-used" | "error";

export default function RiderInvite() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>("loading");
  const [riderFirstName, setRiderFirstName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: Validate the token (public endpoint)
  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    fetch(`${BASE_URL}/api/rider-invites/validate/${token}`)
      .then(async (res) => {
        if (!res.ok) { setStatus("invalid"); return; }
        const data = await res.json();
        setRiderFirstName(data.riderFirstName ?? null);
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  // Step 2: Once signed in and token is valid, auto-accept
  useEffect(() => {
    if (status === "ready" && isLoaded && isSignedIn) {
      handleAccept();
    }
  }, [status, isLoaded, isSignedIn]);

  const handleAccept = async () => {
    setStatus("accepting");
    try {
      const res = await authedFetch(`${BASE_URL}/api/rider-invites/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) { setStatus("already-used"); return; }
        setErrorMsg(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setStatus("done");
      setTimeout(() => setLocation("/dashboard"), 1800);
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    }
  };

  if (status === "loading" || !isLoaded) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-2">
            <ShieldAlert className="h-12 w-12 mx-auto text-destructive mb-2" />
            <CardTitle className="text-2xl">Invalid Invite Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              This invite link is invalid, expired, or has already been used. Ask your parent to send a fresh invite.
            </p>
            <Button asChild className="w-full">
              <a href={`${BASE_URL}/`}>Return to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "done" || status === "accepting") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-3">
            {status === "accepting" ? (
              <Loader2 className="h-14 w-14 mx-auto animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
            )}
            <h2 className="text-xl font-bold">
              {status === "accepting" ? "Setting up your account…" : "You're in!"}
            </h2>
            {status === "done" && (
              <p className="text-muted-foreground">Taking you to the dashboard…</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "already-used") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground opacity-60" />
            <h2 className="text-xl font-bold">Invite already used</h2>
            <p className="text-muted-foreground">This invite has already been accepted. Try signing in directly.</p>
            <Button asChild className="w-full">
              <a href={`${BASE_URL}/dashboard`}>Go to Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-bold">Couldn't activate invite</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" className="w-full" onClick={handleAccept}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // status === "ready" and NOT signed in — show landing card
  const signInUrl = `${BASE_URL}/sign-in?redirect_url=${encodeURIComponent(`${BASE_URL}/rider-invite/${token}`)}`;
  const signUpUrl = `${BASE_URL}/sign-up?redirect_url=${encodeURIComponent(`${BASE_URL}/rider-invite/${token}`)}`;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center mb-8">
        <Mountain className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-4xl font-bold text-foreground tracking-tight">TrailTribe</h1>
        <p className="text-muted-foreground mt-1">Mountain bike team hub</p>
      </div>

      <Card className="max-w-md w-full shadow-lg border-primary/20">
        <CardHeader className="text-center pb-4">
          <Bike className="h-10 w-10 mx-auto text-primary mb-2" />
          <CardTitle className="text-2xl">
            {riderFirstName ? `Hey ${riderFirstName}!` : "You've been invited!"}
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Your parent has invited you to manage your own TrailTribe account — view events, RSVP, and join carpools yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <a href={signUpUrl}>Create My Account</a>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <a href={signInUrl} className="text-primary hover:underline">Sign in instead</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
