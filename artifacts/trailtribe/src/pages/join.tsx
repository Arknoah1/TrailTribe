import { useGetInviteLinkByCode } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mountain, Users, ShieldAlert } from "lucide-react";

export default function Join() {
  const params = useParams();
  const code = params.code || "";

  const { data: invite, isLoading, isError } = useGetInviteLinkByCode(code, {
    query: { enabled: !!code }
  });

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="animate-pulse">Loading invite details...</div></div>;
  }

  if (isError || !invite) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-2">
            <ShieldAlert className="h-12 w-12 mx-auto text-destructive mb-2" />
            <CardTitle className="text-2xl">Invalid Invite Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">This invite link is either invalid, expired, or has already been used.</p>
            <Button asChild className="w-full">
              <Link href="/">Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center mb-8">
        <Mountain className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-4xl font-bold text-foreground tracking-tight">TrailTribe</h1>
      </div>

      <Card className="max-w-md w-full shadow-lg border-primary/20">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">You've been invited!</CardTitle>
          <CardDescription className="text-base mt-2">
            {invite.householdId ? 'Join your family household' : invite.podId ? 'Join your team pod' : 'Join the team'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg flex items-start gap-3">
            <Users className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">What is TrailTribe?</p>
              <p className="text-muted-foreground mt-1">TrailTribe is our team's central hub for schedules, RSVPs, carpools, and communication. It's built specifically for mountain bike teams.</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button asChild className="w-full" size="lg">
              <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-up`}>Create Account & Join</a>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account? <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`} className="text-primary hover:underline">Sign in</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
