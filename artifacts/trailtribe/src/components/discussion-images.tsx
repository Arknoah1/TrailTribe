import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { useRequestBoardImageUploadUrl, useRequestBroadcastImageUploadUrl } from "@workspace/api-client-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function attachmentUrl(path: string, scope: "board" | "messages") {
  return `${BASE_URL}/api/${scope}/attachments/${path.replace(/^\/objects\//, "")}`;
}

export function DiscussionImages({ paths, scope = "board" }: { paths?: string[]; scope?: "board" | "messages" }) {
  const authedFetch = useAuthedFetch();
  const [urls, setUrls] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const pathKey = (paths ?? []).join("\n");

  useEffect(() => {
    let active = true;
    setUrls([]);
    setFailed(false);
    const controller = new AbortController();
    const objectUrls = new Set<string>();
    Promise.all((paths ?? []).map(async (path) => {
      const response = await authedFetch(attachmentUrl(path, scope), { signal: controller.signal });
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
      if (active) { setUrls([]); setFailed(true); }
    });
    return () => {
      active = false;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [authedFetch, pathKey, scope]);

  if (failed) return <p className="mt-3 text-sm text-muted-foreground" role="status">Pictures could not be loaded. Refresh to try again.</p>;
  if (!urls.length) return null;
  return (
    <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
      {urls.map((url, index) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border-2 border-[#0a0c10]/20 bg-muted">
          <img src={url} alt={`Message attachment ${index + 1}`} className="h-auto w-full object-contain" data-testid={`message-image-${index}`} />
        </a>
      ))}
    </div>
  );
}

export type DiscussionImagePickerHandle = { uploadFiles: (files: File[]) => void };

export const DiscussionImagePicker = forwardRef<DiscussionImagePickerHandle, {
  paths: string[];
  onChange: (paths: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  scope?: "board" | "messages";
}>(function DiscussionImagePicker({
  paths,
  onChange,
  onUploadingChange,
  disabled,
  scope = "board",
}, ref) {
  const boardUpload = useRequestBoardImageUploadUrl();
  const broadcastUpload = useRequestBroadcastImageUploadUrl();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  const uploadControllerRef = useRef<AbortController | null>(null);
  const fileSizesRef = useRef<Record<string, number>>({});

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

  const uploadFiles = async (files: File[] | FileList | null) => {
    if (!files?.length || disabled || uploadControllerRef.current) return;
    const selected = Array.from(files);
    if (selected.length + paths.length > MAX_IMAGES) {
      toast({ title: "Attach up to 4 pictures", description: "Remove a picture before adding more.", variant: "destructive" });
      return;
    }
    if (selected.some((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
      toast({ title: "Choose JPG, PNG, WebP, or GIF images under 10 MB", variant: "destructive" });
      return;
    }
    const currentBytes = paths.reduce((sum, path) => sum + (fileSizesRef.current[path] ?? 0), 0);
    if (currentBytes + selected.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024) {
      toast({ title: "Pictures must total 15 MB or less", description: "Choose smaller pictures so they can be included in email.", variant: "destructive" });
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
        const { uploadURL, objectPath } = await (scope === "messages" ? broadcastUpload : boardUpload).mutateAsync({
          data: { name: file.name, size: file.size, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif" },
        });
        const upload = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          signal: controller.signal,
        });
        if (!upload.ok) throw new Error("Image upload failed");
        uploaded.push(objectPath);
        fileSizesRef.current[objectPath] = file.size;
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
  useImperativeHandle(ref, () => ({ uploadFiles: files => { void uploadFiles(files); } }));

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
              {previews[path] && <img src={previews[path]} alt="Attachment preview" className="h-full w-full object-contain" />}
              <Button type="button" size="icon" variant="secondary" disabled={disabled || uploading} onClick={() => remove(path)} className="absolute right-1 top-1 h-7 w-7 rounded-full" aria-label="Remove image" data-testid={`remove-picture-${paths.indexOf(path)}`}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" data-testid="input-message-pictures" onChange={(event) => uploadFiles(event.target.files)} />
      {paths.length < MAX_IMAGES && (
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => inputRef.current?.click()} className="border-2 border-[#0a0c10]" data-testid="add-message-pictures">
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {uploading ? "Uploading…" : "Add pictures"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Upload or paste up to 4 pictures, 10 MB each; 15 MB total for email.</p>
    </div>
  );
});