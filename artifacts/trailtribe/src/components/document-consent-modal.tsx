import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Check, Loader2 } from "lucide-react";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { useToast } from "@/hooks/use-toast";

/** Verbatim text stored in the consent audit log */
export const ACCEPTANCE_TEXT =
  'Please read this document carefully. By checking the "I accept terms & submit" button, I acknowledge that I accept the terms of this document.';

const MIN_READ_SECONDS = 3;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export interface DocumentConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  /** Resolved URL to display. External (http/https) or auth-gated storage path. */
  viewUrl: string | null;
  documentType: "liability_waiver" | "media_release" | "code_of_conduct";
  householdId: number;
  /** Called after a successful consent POST */
  onAccepted?: () => void;
  /** When true, just shows the document with a Close button — no signing */
  readOnly?: boolean;
}

export function DocumentConsentModal({
  open,
  onOpenChange,
  label,
  viewUrl,
  documentType,
  householdId,
  onAccepted,
  readOnly = false,
}: DocumentConsentModalProps) {
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();

  // iframeSrc is either the external URL or a blob URL for auth-gated storage files
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Read-timer: enable the Accept button after MIN_READ_SECONDS
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Load the document when the modal opens
  useEffect(() => {
    if (!open) {
      // Clean up blob URL on close
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setIframeSrc(null);
      return;
    }
    if (!viewUrl) return;

    if (viewUrl.startsWith("http://") || viewUrl.startsWith("https://")) {
      setIframeSrc(viewUrl);
      return;
    }

    // Auth-gated storage URL — fetch with credentials and create a blob URL
    setLoadingDoc(true);
    authedFetch(viewUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error("fetch failed");
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setIframeSrc(url);
      })
      .catch(() => {
        toast({
          title: "Could not load document",
          description: "Check your connection and try again.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingDoc(false));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [open, viewUrl]);

  // Start the read timer when modal opens (signing mode only)
  useEffect(() => {
    if (!open || readOnly) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= MIN_READ_SECONDS && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, readOnly]);

  const canAccept = elapsed >= MIN_READ_SECONDS;

  const handleAccept = async () => {
    if (!canAccept || submitting) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(
        `${BASE_URL}/api/households/${householdId}/compliance/consent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentType }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: err.error ?? "Failed to record your acceptance",
          variant: "destructive",
        });
        return;
      }
      onAccepted?.();
      onOpenChange(false);
    } catch {
      toast({
        title: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-3xl h-[85dvh] sm:h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 shrink-0" />
            {label}
          </DialogTitle>
        </DialogHeader>

        {/* Document area */}
        <div className="flex-1 min-h-0 relative">
          {loadingDoc && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {iframeSrc ? (
            <iframe
              src={iframeSrc}
              className="w-full h-full border-0"
              title={label}
            />
          ) : !loadingDoc ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 text-muted-foreground">
              <FileText className="h-14 w-14 mb-3 opacity-20" />
              <p className="font-semibold text-foreground">Document not yet uploaded</p>
              <p className="text-sm mt-1 max-w-xs">
                Your coach hasn't uploaded this document yet. Check back later or contact your coach.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {readOnly ? (
          <div className="border-t px-4 py-3 sm:px-6 sm:py-4 shrink-0">
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="border-t px-4 py-3 sm:px-6 sm:py-4 shrink-0 space-y-2 sm:space-y-3 bg-muted/30">
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {ACCEPTANCE_TEXT}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <Button
                variant="outline"
                className="sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:flex-1"
                onClick={handleAccept}
                disabled={!canAccept || submitting || !iframeSrc}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {submitting
                  ? "Recording…"
                  : !canAccept
                  ? `Please read… (${MIN_READ_SECONDS - elapsed}s)`
                  : "I Accept Terms & Submit"}
              </Button>
            </div>
            {!viewUrl && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                This document must be uploaded by your coach before you can sign it.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
