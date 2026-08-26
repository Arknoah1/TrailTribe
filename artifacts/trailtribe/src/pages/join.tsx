import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mountain, Users, ShieldAlert, Home, CheckCircle2, Loader2 } from "lucide-react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type Status = "loading" | "invalid" | "ready" | "joining" | "already-joined" | "done" | "error";

export default function Join() {
  const params = useParams<{ code: string }>();
  const code = params.code || "";
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const authedFetch = useAuthedFetch();

  const [status, setStatus] = useState<Status>("loading");
  const [household, setHousehold] = useState<{ id: number; name: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: Validate the invite code (public endpoint, no auth needed)
  useEffect(() => {
    if (!code) { setStatus("invalid"); return; }
    fetch(`${BASE_URL}/api/households/by-invite/${code}`)
      .then(async (res) => {
        if (!res.ok) { setStatus("invalid"); return; }
        const data = await res.json();
        setHousehold(data);
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [code]);

  // Step 2: If signed in and code is valid, auto-join immediately
  useEffect(() => {
    if (status === "ready" && isLoaded && isSignedIn) {
      handleJoin();
    }
  }, [status, isLoaded, isSignedIn]);

  const handleJoin = async () => {
    setStatus("joining");
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      if (res.status === 409) {
        // Already in a household
        setStatus("already-joined");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("done");
      setTimeout(() => setLocation("/profile"), 1500);
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    }
  };

  // While Clerk loads or we're validating
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
              This invite link is either invalid or expired. Ask the person who sent it to share a fresh link from their Profile page.
            </p>
            <Button asChild className="w-full">
              <a href={`${BASE_URL}/`}>Return to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-3">
            <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
            <h2 className="text-xl font-bold">You're in!</h2>
            <p className="text-muted-foreground">You've joined the <span className="font-semibold text-foreground">{household?.name}</span> household. Redirecting...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "already-joined") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <Home className="h-12 w-12 mx-auto text-muted-foreground opacity-60" />
            <h2 className="text-xl font-bold">Already in a household</h2>
            <p className="text-muted-foreground">Your account is already linked to a household. Each account can only belong to one family.</p>
            <Button asChild className="w-full">
              <a href={`${BASE_URL}/profile`}>Go to My Profile</a>
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
            <h2 className="text-xl font-bold">Couldn't join</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" className="w-full" onClick={handleJoin}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // status === "ready" and NOT signed in — show the landing card
  const signInUrl = `${BASE_URL}/sign-in?redirect_url=${encodeURIComponent(`${BASE_URL}/join/${code}`)}`;
  const signUpUrl = `${BASE_URL}/sign-up?redirect_url=${encodeURIComponent(`${BASE_URL}/join/${code}`)}`;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center mb-8">
        <Mountain className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-4xl font-bold text-foreground tracking-tight">TrailTeam</h1>
        <p className="text-muted-foreground mt-1">Mountain bike team hub</p>
      </div>

      <Card className="max-w-md w-full shadow-lg border-primary/20">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">You've been invited!</CardTitle>
          <CardDescription className="text-base mt-2">
            Join the <span className="font-semibold text-foreground">{household?.name}</span> household on TrailTeam
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg flex items-start gap-3">
            <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">What is TrailTeam?</p>
              <p className="text-muted-foreground mt-1">
                TrailTeam is your team's hub for schedules, RSVPs, carpools, and team communication — built for mountain bike families.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <a href={signUpUrl}>Create Account &amp; Join</a>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <a href={signInUrl} className="text-primary hover:underline">Sign in to join</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
