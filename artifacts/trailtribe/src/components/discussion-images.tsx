import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function attachmentUrl(path: string) {
  return `${BASE_URL}/api/board/attachments/${path.replace(/^\/objects\//, "")}`;
}

export function DiscussionImages({ paths }: { paths?: string[] }) {
  const authedFetch = useAuthedFetch();
  const [urls, setUrls] = useState<string[]>([]);
  const pathKey = (paths ?? []).join("\n");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const objectUrls = new Set<string>();
    Promise.all((paths ?? []).map(async (path) => {
      const response = await authedFetch(attachmentUrl(path), { signal: controller.signal });
      if (!response.ok) throw new Error("Image unavailable");
      const url = URL.createObjectURL(await response.blob());
      if (!active) {
        URL.revokeObjectURL(url);
        throw new Error("Image load cancelled");
      }
      objectUrls.add(url);
      return url;
    })).then((loaded) => {
      if (active) setUrls(loaded);
    }).catch(() => {
      if (active) setUrls([]);
    });
    return () => {
      active = false;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [authedFetch, pathKey]);

  if (!urls.length) return null;
  return (
    <div className={`mt-3 grid gap-2 ${urls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {urls.map((url, index) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border-2 border-[#0a0c10]/20 bg-muted">
          <img src={url} alt={`Discussion attachment ${index + 1}`} className="max-h-96 w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

export function DiscussionImagePicker({
  paths,
  onChange,
  onUploadingChange,
  disabled,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  const uploadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    setPreviews((current) => {
      const next = { ...current };
      let changed = false;
      for (const [path, url] of Object.entries(current)) {
        if (!paths.includes(path)) {
          URL.revokeObjectURL(url);
          delete next[path];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [paths]);

  useEffect(() => () => {
    uploadControllerRef.current?.abort();
    Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, MAX_IMAGES - paths.length);
    if (selected.some((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
      toast({ title: "Choose JPG, PNG, WebP, or GIF images under 10 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const nextPreviews: Record<string, string> = {};
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const request = await authedFetch(`${BASE_URL}/api/board/attachments/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          signal: controller.signal,
        });
        if (!request.ok) throw new Error("Could not prepare upload");
        const { uploadURL, objectPath } = await request.json();
        const upload = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          signal: controller.signal,
        });
        if (!upload.ok) throw new Error("Image upload failed");
        uploaded.push(objectPath);
        nextPreviews[objectPath] = URL.createObjectURL(file);
      }
      setPreviews((current) => ({ ...current, ...nextPreviews }));
      onChange([...paths, ...uploaded]);
    } catch (error) {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url));
      toast({
        title: "Could not attach image",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      uploadControllerRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (path: string) => {
    const preview = previews[path];
    if (preview) URL.revokeObjectURL(preview);
    setPreviews((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    onChange(paths.filter((candidate) => candidate !== path));
  };

  return (
    <div className="space-y-2">
      {paths.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {paths.map((path) => (
            <div key={path} className="relative aspect-square overflow-hidden rounded-xl border-2 border-[#0a0c10]/20 bg-muted">
              {previews[path] && <img src={previews[path]} alt="Attachment preview" className="h-full w-full object-cover" />}
              <Button type="button" size="icon" variant="secondary" onClick={() => remove(path)} className="absolute right-1 top-1 h-7 w-7 rounded-full" aria-label="Remove image">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(event) => uploadFiles(event.target.files)} />
      {paths.length < MAX_IMAGES && (
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => inputRef.current?.click()} className="border-2 border-[#0a0c10]">
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {uploading ? "Uploading…" : "Add pictures"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Up to 4 pictures, 10 MB each.</p>
    </div>
  );
}