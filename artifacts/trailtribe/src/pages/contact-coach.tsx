import { useContactCoach, useListUsers } from "@workspace/api-client-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Send, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ContactCoach() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [coachId, setCoachId] = useState<string>("all");

  const { data: coaches } = useListUsers({ role: "coach" });

  const contactMutation = useContactCoach({
    mutation: {
      onSuccess: () => {
        toast({ title: "Message sent to coach(es)" });
        setLocation("/messages");
      },
      onError: () => toast({ title: "Failed to send message", variant: "destructive" })
    }
  });

  const handleSend = () => {
    if (!body) {
      toast({ title: "Message body is required", variant: "destructive" });
      return;
    }

    contactMutation.mutate({
      data: {
        subject,
        body,
        coachUserId: coachId === "all" ? null : parseInt(coachId)
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <Link href="/messages" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Messages
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact Coach</h1>
        <p className="text-muted-foreground mt-1">Send a direct message to team coaches.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="space-y-2">
            <Label>To</Label>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a coach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coaches in My Pod</SelectItem>
                {coaches?.map(coach => (
                  <SelectItem key={coach.id} value={coach.id.toString()}>
                    {coach.firstName} {coach.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Question about next practice" />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea 
              className="min-h-[200px]" 
              value={body} 
              onChange={e => setBody(e.target.value)} 
              placeholder="Type your message here..." 
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={contactMutation.isPending || !body} className="w-full sm:w-auto">
          <Send className="h-4 w-4 mr-2" />
          {contactMutation.isPending ? "Sending..." : "Send Message"}
        </Button>
      </div>
    </div>
  );
}
