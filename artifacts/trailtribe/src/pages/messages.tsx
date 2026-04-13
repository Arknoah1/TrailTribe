import { useListBroadcasts } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Smartphone, Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Messages() {
  const { data: broadcasts, isLoading } = useListBroadcasts();

  if (isLoading) return <div className="p-8 text-center">Loading messages...</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground mt-1">Archive of team broadcasts and announcements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/messages/contact">Contact Coach</Link>
          </Button>
          <Button asChild>
            <Link href="/messages/new">New Broadcast</Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search messages..." className="pl-10 max-w-md bg-card" />
      </div>

      <div className="space-y-4">
        {broadcasts && broadcasts.length > 0 ? (
          broadcasts.map(msg => (
            <Card key={msg.id} className="overflow-hidden">
              <CardHeader className="bg-muted/50 pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{msg.subject || "No Subject"}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                      <span className="font-medium text-foreground">{msg.sender?.firstName} {msg.sender?.lastName}</span>
                      <span>•</span>
                      <span>{msg.sentAt ? format(new Date(msg.sentAt), "MMM d, yyyy 'at' h:mm a") : 'Draft'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {msg.channel === 'email' && <Mail className="h-4 w-4 text-muted-foreground" title="Email" />}
                    {msg.channel === 'sms' && <Smartphone className="h-4 w-4 text-muted-foreground" title="SMS" />}
                    {msg.channel === 'push' && <Bell className="h-4 w-4 text-muted-foreground" title="Push" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 text-sm prose dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap">{msg.body}</div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center p-12 border rounded-lg bg-card">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No messages</h3>
            <p className="text-muted-foreground">You haven't received any broadcasts yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
