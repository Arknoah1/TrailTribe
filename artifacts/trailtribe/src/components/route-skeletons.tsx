import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl border-2 border-border bg-card p-4 ${className}`}><Skeleton className="h-full w-full" /></div>;
}

export function CalendarSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 px-6 pt-4 md:px-8 md:pt-8" aria-label="Loading calendar" role="status">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-10 w-44" /><Skeleton className="h-4 w-64" /></div>
        <Skeleton className="h-10 w-24 shrink-0" />
      </div>
      <div className="flex gap-2 overflow-hidden"><Skeleton className="h-9 w-24 shrink-0 rounded-full" /><Skeleton className="h-9 w-24 shrink-0 rounded-full" /><Skeleton className="h-9 w-20 shrink-0 rounded-full" /></div>
      <div className="space-y-4">
        {[0, 1, 2].map(i => <SkeletonCard key={i} className="h-40 md:h-44" />)}
      </div>
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 px-6 pt-4 md:px-8 md:pt-8" aria-label="Loading event" role="status">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3"><Skeleton className="h-10 w-3/4 md:w-1/2" /><Skeleton className="h-4 w-56" /></div>
      <SkeletonCard className="h-36" />
      <div className="grid gap-4 md:grid-cols-2"><SkeletonCard className="h-32" /><SkeletonCard className="h-32" /></div>
    </div>
  );
}

export function CarpoolBoardSkeleton({ section = "both" }: { section?: "offers" | "requests" | "both" }) {
  return (
    <div className="space-y-6" aria-label="Loading carpool details" role="status">
      {(section === "requests" || section === "both") && <div className="space-y-3"><Skeleton className="h-8 w-44" /><SkeletonCard className="h-32" /></div>}
      {(section === "offers" || section === "both") && <div className="space-y-3"><Skeleton className="h-8 w-48" /><SkeletonCard className="h-32" /></div>}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8" aria-label="Loading profile" role="status">
      <div className="space-y-2"><Skeleton className="h-9 w-36" /><Skeleton className="h-4 w-64" /></div>
      <Skeleton className="h-11 w-full" />
      <SkeletonCard className="h-64" />
    </div>
  );
}