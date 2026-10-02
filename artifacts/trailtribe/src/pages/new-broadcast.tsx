import { getListBroadcastsQueryKey, useListPods, useSendBroadcast } from "@workspace/api-client-react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichMessageEditor } from "@/components/rich-message-editor";
import { DiscussionImagePicker, type DiscussionImagePickerHandle } from "@/components/discussion-images";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Send, Mail, Smartphone, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { trackEvent } from "@/lib/analytics";

export default function NewBroadcast() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: pods } = useListPods();
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['email']);
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [isAllTeam, setIsAllTeam] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const imagePickerRef = useRef<DiscussionImagePickerHandle>(null);
  const queryClient = useQueryClient();

  const sendMutation = useSendBroadcast({
    mutation: {
      onSuccess: (_data, variables) => {
        trackEvent("broadcast_sent", {
          channel: variables.data.channel,
          audience: variables.data.isAllTeam ? "all_team" : "selected_pods",
          pod_count: variables.data.targetPodIds?.length ?? 0,
        });
        toast({ title: "Broadcast sent successfully" });
        queryClient.invalidateQueries({ queryKey: getListBroadcastsQueryKey() });
        setLocation("/messages?tab=announcements");
      },
      onError: (error) => toast({ title: "Failed to send broadcast", description: (error as { data?: { error?: string } }).data?.error, variant: "destructive" })
    }
  });

  const toggleChannel = (c: string) => {
    if (selectedChannels.includes(c)) setSelectedChannels(selectedChannels.filter(x => x !== c));
    else setSelectedChannels([...selectedChannels, c]);
  };

  const togglePod = (p: string) => {
    if (selectedPods.includes(p)) setSelectedPods(selectedPods.filter(x => x !== p));
    else setSelectedPods([...selectedPods, p]);
  };

  const handleSend = () => {
    if (uploading || sendMutation.isPending) return;
    if (!body) {
      toast({ title: "Message body is required", variant: "destructive" });
      return;
    }
    if (selectedChannels.length === 0) {
      toast({ title: "Select at least one channel", variant: "destructive" });
      return;
    }
    if (!isAllTeam && selectedPods.length === 0) {
      toast({ title: "Select recipients (All Team or specific Pods)", variant: "destructive" });
      return;
    }

    selectedChannels.forEach(channel => {
      sendMutation.mutate({
        data: {
          subject,
          body,
          bodyFormat: "markdown",
          imageObjectPaths: images,
          channel: channel as any,
          targetPodIds: isAllTeam ? [] : selectedPods,
          isAllTeam
        }
      });
    });
  };

  return (
    <div className="min-w-0 p-6 pb-[calc(var(--mobile-bottom-nav-height,78px)+env(safe-area-inset-bottom)+1.5rem)] md:p-8 max-w-3xl mx-auto space-y-6">
      <Link href="/messages" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Messages
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Broadcast</h1>
        <p className="text-muted-foreground mt-1">Send an announcement to the team.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="all-team" checked={isAllTeam} onCheckedChange={(c) => setIsAllTeam(!!c)} />
              <Label htmlFor="all-team">All Team</Label>
            </div>
            {!isAllTeam && pods && (
              <div className="pl-6 space-y-2">
                <Label className="text-muted-foreground mb-2 block">Or select specific pods:</Label>
                {pods.map(pod => (
                  <div key={pod.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`pod-${pod.id}`} 
                      checked={selectedPods.includes(pod.id.toString())} 
                      onCheckedChange={() => togglePod(pod.id.toString())} 
                    />
                    <Label htmlFor={`pod-${pod.id}`}>{pod.name}</Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <label className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer transition-colors ${selectedChannels.includes('email') ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}>
                <input type="checkbox" className="sr-only" checked={selectedChannels.includes('email')} onChange={() => toggleChannel('email')} />
                <Mail className="h-6 w-6" />
                <span className="text-sm font-medium">Email</span>
              </label>
              <label className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer transition-colors ${selectedChannels.includes('sms') ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}>
                <input type="checkbox" className="sr-only" checked={selectedChannels.includes('sms')} onChange={() => toggleChannel('sms')} />
                <Smartphone className="h-6 w-6" />
                <span className="text-sm font-medium">SMS</span>
              </label>
              <label className={`flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer transition-colors ${selectedChannels.includes('push') ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}>
                <input type="checkbox" className="sr-only" checked={selectedChannels.includes('push')} onChange={() => toggleChannel('push')} />
                <Bell className="h-6 w-6" />
                <span className="text-sm font-medium">Push</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="broadcast-subject">Subject <span className="text-muted-foreground font-normal">(required for email)</span></Label>
              <Input id="broadcast-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Practice relocated today" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast-body">Message</Label>
              <RichMessageEditor
                id="broadcast-body"
                className="min-h-[150px]" 
                value={body} 
                onChange={setBody}
                disabled={sendMutation.isPending}
                onPasteImages={files => imagePickerRef.current?.uploadFiles(files)}
                placeholder="Type your message here..." 
              />
              <DiscussionImagePicker ref={imagePickerRef} scope="messages" paths={images} onChange={setImages} onUploadingChange={setUploading} disabled={sendMutation.isPending} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sendMutation.isPending || uploading || !body.trim() || selectedChannels.length === 0} className="w-full sm:w-auto" data-testid="send-broadcast">
            <Send className="h-4 w-4 mr-2" />
            {sendMutation.isPending ? "Sending..." : "Send Broadcast"}
          </Button>
        </div>
      </div>
    </div>
  );
}
