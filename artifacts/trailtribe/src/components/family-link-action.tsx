import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type FamilyLinkNotice = {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

type FamilyLinkActionProps = {
  householdName: string;
  getInviteCode: () => Promise<string>;
  notify: (notice: FamilyLinkNotice) => void;
  basePath?: string;
};

export function FamilyLinkAction({
  householdName,
  getInviteCode,
  notify,
  basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") || "",
}: FamilyLinkActionProps) {
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const handleShare = async () => {
    setManualUrl(null);
    try {
      const inviteCode = await getInviteCode();
      const url = `${window.location.origin}${basePath}/join/${encodeURIComponent(inviteCode)}`;

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: `${householdName} family link`,
            text: `Use this private link to join the ${householdName} household on TrailTeam.`,
            url,
          });
          notify({ title: "Family link shared" });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          notify({
            title: "Family link copied",
            description: `Send it to the person joining the ${householdName} household.`,
          });
          return;
        } catch {
          // Fall through to the selectable manual-copy dialog.
        }
      }

      setManualUrl(url);
      notify({
        title: "Copy the family link manually",
        description: "Your device blocked automatic sharing and copying.",
      });
    } catch (error) {
      notify({
        title: error instanceof Error ? error.message : "Unable to get this family's link",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        onClick={handleShare}
      >
        <Link2 className="h-3.5 w-3.5 mr-1.5" />
        Share family link
      </Button>
      <Dialog open={manualUrl !== null} onOpenChange={(open) => { if (!open) setManualUrl(null); }}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy family link</DialogTitle>
            <DialogDescription>
              Copy this link and send it to the person joining the {householdName} household.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={manualUrl ?? ""}
            readOnly
            aria-label="Family invite link"
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="text-xs text-muted-foreground">
            Tap or click the link field to select it, then use your device&apos;s Copy command.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}