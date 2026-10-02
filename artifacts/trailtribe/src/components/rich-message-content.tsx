import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitLinkifiedText } from "@/lib/linkify-text.mjs";
import { LinkPreview } from "@/components/link-preview";
import { messageLinkPreviewText } from "@/lib/message-formatting.mjs";

export function RichMessageContent({
  text, bodyFormat, isDeleted, linkPreviews = false,
}: { text: string; bodyFormat?: string; isDeleted?: boolean; linkPreviews?: boolean }) {
  if (isDeleted) return <div className="text-muted-foreground italic bg-muted/50 px-3 py-2 rounded-md text-sm border border-dashed border-muted-foreground/30">[This message was deleted]</div>;
  const parts = splitLinkifiedText(text);
  const previewParts = bodyFormat === "markdown" ? splitLinkifiedText(messageLinkPreviewText(text)) : parts;
  const urls = [...new Set(previewParts.filter(part => part.type === "link").map(part => part.value))].slice(0, 3);
  return (
    <div className="min-w-0 max-w-full break-words text-sm" data-testid="rich-message-content">
      {bodyFormat === "markdown" ? (
        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:whitespace-pre-wrap [&_pre]:overflow-x-auto [&_a]:break-all">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
            urlTransform={url => /^(https?:\/\/|mailto:)/i.test(url) ? url : ""}
            components={{
              a: ({ href, children }) => href
                ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                : <span>{children}</span>,
              img: ({ alt }) => <span className="text-muted-foreground">{alt || "[Use Add pictures to attach an image]"}</span>,
              table: ({ children }) => <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Message table"><table className="w-max min-w-full border-collapse text-left">{children}</table></div>,
              th: ({ children, style }) => <th style={style} className="border border-border bg-muted px-3 py-2 font-bold">{children}</th>,
              td: ({ children, style }) => <td style={style} className="border border-border px-3 py-2">{children}</td>,
            }}
          >{text}</ReactMarkdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap">
          {parts.map((part, index) => part.type === "link"
            ? <Fragment key={index}><a href={part.value} target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2 break-all">{part.value}</a></Fragment>
            : <span key={index}>{part.value}</span>)}
        </div>
      )}
      {linkPreviews && urls.map(url => <LinkPreview key={url} url={url} />)}
    </div>
  );
}