import { forwardRef, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Bold, Italic, List, ListOrdered, Link2, Table2, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RichMessageContent } from "@/components/rich-message-content";
import { formatSelection, rowsToMarkdownTable, spreadsheetTextToMarkdown, validateMessageLink } from "@/lib/message-formatting.mjs";
import { useToast } from "@/hooks/use-toast";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  onPasteImages?: (files: File[]) => void;
  compact?: boolean;
};

export const RichMessageEditor = forwardRef<HTMLTextAreaElement, Props>(function RichMessageEditor({
  value, onChange, onPasteImages, compact, disabled, className, ...props
}, forwardedRef) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [linkSelection, setLinkSelection] = useState<{ start: number; end: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const { toast } = useToast();
  const insert = (action: string) => {
    const input = inputRef.current;
    if (action === "link") {
      const start = input?.selectionStart ?? value.length;
      const end = input?.selectionEnd ?? value.length;
      if (value.slice(start, end).includes("\n")) {
        toast({ title: "Select a short phrase for the link", description: "Links cannot wrap an entire table or multiple paragraphs.", variant: "destructive" });
        return;
      }
      setLinkSelection({ start, end });
      setLinkUrl("");
      return;
    }
    const selection = formatSelection(value, input?.selectionStart ?? value.length, input?.selectionEnd ?? value.length, action);
    onChange(selection.value);
    setPreview(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(selection.start, selection.end);
    });
  };
  return (
    <div className="min-w-0 w-full space-y-2" data-testid="rich-message-editor">
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Message formatting">
        {[
          { action: "bold", label: "Bold", Icon: Bold }, { action: "italic", label: "Italic", Icon: Italic },
          { action: "bullets", label: "Bullet list", Icon: List },
          { action: "numbers", label: "Numbered list", Icon: ListOrdered }, { action: "link", label: "Insert link", Icon: Link2 },
          { action: "table", label: "Insert table", Icon: Table2 },
        ].map(({ action, label, Icon }) => (
          <Button key={action} type="button" variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" disabled={disabled}
            aria-label={label} title={label} data-testid={`format-${action}`}
            onMouseDown={event => event.preventDefault()} onClick={() => insert(action)}>
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-11 ml-auto md:h-8" disabled={disabled}
          aria-pressed={preview} data-testid="toggle-message-preview" onClick={() => setPreview(!preview)}>
          {preview ? <Pencil className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
          {preview ? "Write" : "Preview"}
        </Button>
      </div>
      {linkSelection && (
        <div className="space-y-2 rounded-md border bg-card p-3" role="group" aria-label="Insert a link">
          <label className="text-sm font-medium">Link address
            <Input autoFocus value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://example.com" aria-label="Link address" disabled={disabled} />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={disabled || !linkUrl.trim()} onClick={() => {
              let url: string;
              try {
                url = validateMessageLink(linkUrl);
              } catch (error) {
                toast({ title: "Check the link address", description: error instanceof Error ? error.message : "Enter a complete link with a destination.", variant: "destructive" });
                return;
              }
              const selection = formatSelection(value, linkSelection.start, linkSelection.end, "link", url);
              onChange(selection.value);
              setLinkSelection(null);
              setPreview(false);
              requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(selection.start, selection.end); });
            }}>Add link</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLinkSelection(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {preview && <div className={`rounded-md border bg-card p-3 overflow-y-auto ${compact ? "max-h-40" : "max-h-80"}`} data-testid="message-preview">
        {value.trim() ? <RichMessageContent text={value} bodyFormat="markdown" /> : <p className="text-sm text-muted-foreground">Write a message to preview it here.</p>}
      </div>}
      <Textarea {...props} value={value} disabled={disabled} maxLength={50000}
        className={`${className ?? ""} ${preview ? "hidden" : ""}`}
        ref={node => {
          inputRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        onChange={event => onChange(event.target.value)}
        onPaste={event => {
          const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
          if (images.length && onPasteImages) {
            event.preventDefault();
            onPasteImages(images);
            return;
          }
          try {
            const html = event.clipboardData.getData("text/html");
            const table = html ? new DOMParser().parseFromString(html, "text/html").querySelector("table") : null;
            const markdown = table
              ? rowsToMarkdownTable(Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.textContent ?? "")))
              : spreadsheetTextToMarkdown(event.clipboardData.getData("text/plain"));
            if (markdown) { event.preventDefault(); insert(`\n\n${markdown}\n\n`); }
          } catch (error) {
            event.preventDefault();
            toast({ title: "Could not paste table", description: error instanceof Error ? error.message : "Try a smaller selection.", variant: "destructive" });
          }
        }}
      />
      {!compact && <p className="text-xs text-muted-foreground">Use formatting buttons or Markdown. Paste Excel cells for a table; add a screenshot to keep exact colors and layout.</p>}
    </div>
  );
});