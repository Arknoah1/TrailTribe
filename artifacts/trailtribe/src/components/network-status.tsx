import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RequestError = {
  status?: number;
};

type NetworkEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * Keeps the browser lifecycle separate from the banner so the offline-to-online
 * transition can be exercised without relying on a particular browser runner.
 */
export function subscribeToNetworkRecovery(
  eventTarget: NetworkEventTarget,
  refetchActiveQueries: () => void,
  onOffline: () => void,
  onOnline: () => void,
) {
  const markOffline = () => onOffline();
  const markOnline = () => {
    refetchActiveQueries();
    onOnline();
  };

  eventTarget.addEventListener("offline", markOffline);
  eventTarget.addEventListener("online", markOnline);

  return () => {
    eventTarget.removeEventListener("offline", markOffline);
    eventTarget.removeEventListener("online", markOnline);
  };
}

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as RequestError).status;
  return typeof status === "number" ? status : undefined;
}

export function getLoadErrorMessage(feature: string, error: unknown) {
  const status = getStatus(error);

  if (!navigator.onLine) {
    return `You're offline. Reconnect to load ${feature}.`;
  }
  if (status === 401) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (status === 403) {
    return `You don't have permission to view ${feature}.`;
  }
  if (status === 404) {
    return `This ${feature} is no longer available.`;
  }
  if (status && status >= 500) {
    return `TrailTeam couldn't load ${feature} right now. Please try again.`;
  }
  return `Check your connection and try loading ${feature} again.`;
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex min-h-40 items-center justify-center gap-2 p-8 text-center text-sm font-medium text-muted-foreground", className)}>
      <RefreshCw className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function LoadErrorCard({
  feature,
  error,
  onRetry,
  className,
}: {
  feature: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border-2 border-destructive/60 bg-destructive/10 p-5", className)} role="alert">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Couldn&apos;t load {feature}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{getLoadErrorMessage(feature, error)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}

export function NetworkStatusBanner() {
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<"offline" | "restored" | null>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : null,
  );
  const wasOffline = useRef(connectionState === "offline");

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      setConnectionState("offline");
    };

    const handleOnline = () => {
      if (wasOffline.current) {
        setConnectionState("restored");
        window.setTimeout(() => setConnectionState(null), 4_000);
      }
    };

    return subscribeToNetworkRecovery(
      window,
      () => { void queryClient.refetchQueries({ type: "active" }); },
      () => {
        wasOffline.current = true;
        setConnectionState("offline");
      },
      handleOnline,
    );
  }, [queryClient]);

  if (!connectionState) return null;

  const restored = connectionState === "restored";
  return (
    <div
      role="status"
      className={cn(
        "fixed left-3 right-3 top-20 z-[45] flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-center text-xs font-semibold shadow-cel-sm md:left-auto md:right-5 md:top-5 md:max-w-sm",
        restored
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-destructive/60 bg-destructive text-destructive-foreground",
      )}
    >
      {restored ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      {restored ? "Back online — refreshing your updates." : "You're offline. We’ll refresh when you reconnect."}
    </div>
  );
}