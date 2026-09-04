import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  getGetLinkPreviewQueryKey,
  useGetLinkPreview,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { firstLinkifiedUrl } from "@/lib/linkify-text.mjs";

function PreviewCard({ url, compact = false }: { url: string; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { data, isLoading } = useGetLinkPreview({ url }, {
    query: {
      enabled: Boolean(url),
      queryKey: getGetLinkPreviewQueryKey({ url }),
      retry: false,
    },
  });

  useEffect(() => setImageFailed(false), [url]);

  if (isLoading) {
    return (
      <Skeleton
        data-testid="link-preview-loading"
        className={compact
          ? "h-20 w-full rounded-xl border border-[#0a0c10]/15"
          : "not-prose my-3 h-28 w-full max-w-xl rounded-xl border border-[#0a0c10]/15 sm:h-36"}
      />
    );
  }
  if (!data) return null;

  const label = data.siteName || data.hostname;
  const showImage = Boolean(data.imageUrl) && !imageFailed;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${data.title} on ${label} in a new page`}
      data-testid="link-preview-card"
      className={compact
        ? "group flex min-w-0 w-full overflow-hidden rounded-xl border border-[#0a0c10]/25 bg-background text-foreground no-underline transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        : "not-prose group my-3 flex w-full max-w-xl flex-col overflow-hidden rounded-xl border-2 border-[#0a0c10] bg-card text-foreground no-underline shadow-cel-sm transition-transform hover:-translate-y-0.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:flex-row"}
    >
      {showImage && (
        <div className={compact
          ? "h-20 w-24 shrink-0 overflow-hidden bg-muted"
          : "aspect-video w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-48"}
        >
          <img
            src={data.imageUrl ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className={compact ? "min-w-0 flex-1 p-2.5" : "min-w-0 flex-1 p-3 sm:p-4"}>
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className={`${compact ? "line-clamp-1 text-sm" : "line-clamp-2 text-sm sm:text-base"} mt-1 font-bold leading-tight`}>
          {data.title}
        </div>
        {!compact && data.description && (
          <div className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{data.description}</div>
        )}
      </div>
    </a>
  );
}

export function LinkPreview({ url }: { url: string }) {
  return <PreviewCard url={url} />;
}

export function ComposerLinkPreview({ text }: { text: string }) {
  const detectedUrl = firstLinkifiedUrl(text);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!detectedUrl) {
      setPreviewUrl("");
      return;
    }
    const timer = window.setTimeout(() => setPreviewUrl(detectedUrl), 400);
    return () => window.clearTimeout(timer);
  }, [detectedUrl]);

  if (!previewUrl || previewUrl !== detectedUrl) return null;

  return (
    <div className="min-w-0" data-testid="composer-link-preview">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Link preview</div>
      <PreviewCard url={previewUrl} compact />
    </div>
  );
}