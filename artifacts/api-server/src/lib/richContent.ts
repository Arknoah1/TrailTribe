import MarkdownIt from "markdown-it";

export type BodyFormat = "plain" | "markdown";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});
const markdownImageDetector = new MarkdownIt({ html: false });
markdown.validateLink = (url) => {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

markdown.renderer.rules.image = (tokens, index) =>
  escapeHtml(tokens[index].content);

export function hasInlineMarkdownImages(body: string): boolean {
  return markdownImageDetector.parse(body, {}).some((token) =>
    token.type === "inline" && token.children?.some((child) => child.type === "image"),
  );
}

export function getBodyFormat(format: unknown): BodyFormat {
  return format === "markdown" ? "markdown" : "plain";
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decorateEmailTables(html: string): string {
  return html
    .replaceAll("<table>", '<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0">')
    .replace(/<th\b([^>]*)>/g, (_tag, attributes: string) =>
      decorateEmailTableCell("th", attributes, "border:1px solid #cbd5e1;background:#f1f5f9;text-align:left;padding:6px"))
    .replace(/<td\b([^>]*)>/g, (_tag, attributes: string) =>
      decorateEmailTableCell("td", attributes, "border:1px solid #cbd5e1;padding:6px;vertical-align:top"));
}

function decorateEmailTableCell(tag: "th" | "td", attributes: string, styles: string): string {
  const styleAttribute = attributes.match(/\sstyle="([^"]*)"/);
  const mergedStyle = styleAttribute
    ? `${styles};${styleAttribute[1]}`
    : styles;
  const cleanAttributes = attributes.replace(/\sstyle="[^"]*"/, "");
  return `<${tag}${cleanAttributes} style="${mergedStyle}">`;
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
      const destination = href
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const linkText = label.replace(/<[^>]+>/g, "").trim();
      return linkText === destination ? linkText : `${linkText} (${destination})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface InlineEmailImage {
  cid: string;
  filename: string;
}

export function renderEmailContent(
  body: string,
  bodyFormat: unknown,
  images: InlineEmailImage[] = [],
): { html: string; text: string } {
  const format = getBodyFormat(bodyFormat);
  const contentHtml = format === "markdown"
    ? decorateEmailTables(markdown.render(body))
    : `<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>`;
  const imageHtml = images.map(({ cid, filename }) =>
    `<p><img src="cid:${escapeHtml(cid)}" alt="${escapeHtml(filename)}" style="display:block;max-width:100%;height:auto;margin:12px 0"></p>`,
  ).join("");
  const imageText = images.map(({ filename }) => `[Attached image: ${filename}]`).join("\n");
  const contentText = format === "markdown" ? htmlToReadableText(markdown.render(body)) : body;
  return {
    html: `${contentHtml}${imageHtml}`,
    text: [contentText, imageText].filter(Boolean).join("\n\n"),
  };
}