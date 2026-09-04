import { BlockList, isIP } from "node:net";

export type LinkPreviewMetadata = {
  url: string;
  title: string;
  description: string | null;
  hostname: string;
  imageUrl: string | null;
  siteName: string | null;
  provider: string | null;
};

const blockedPreviewAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedPreviewAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedPreviewAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPrivatePreviewAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 0) return true;
  // Node's network stack can route mapped IPv6 literals to IPv4. Reject the
  // entire mapped range so it cannot bypass the IPv4 reserved-range checks.
  if (family === 6 && /^::ffff:/i.test(addr)) return true;
  return blockedPreviewAddresses.check(addr, family === 4 ? "ipv4" : "ipv6");
}

export function safeImageDataUri(
  statusCode: number,
  contentType: string,
  body: Buffer,
): string | null {
  if (statusCode < 200 || statusCode >= 300) return null;
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalizedType)) return null;
  if (body.length === 0 || body.length > 512 * 1024) return null;
  return `data:${normalizedType};base64,${body.toString("base64")}`;
}

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 600;
const MAX_SITE_NAME_LENGTH = 100;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = decodeHtml(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function getMetaTag(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(
    new RegExp(`<meta\\b(?=[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'])[^>]*>`, "i"),
  )?.[0];
  if (!tag) return null;
  return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? null;
}

function safeImageUrl(raw: string | null, pageUrl: URL): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(decodeHtml(raw), pageUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(url: URL): string | null {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null = null;

  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
      candidate = match?.[1] ?? null;
    }
  }

  return candidate && /^[A-Za-z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
}

export function fallbackLinkPreview(url: URL): LinkPreviewMetadata {
  const youtubeId = extractYouTubeVideoId(url);
  return {
    url: url.href,
    title: youtubeId ? "YouTube video" : url.hostname,
    description: null,
    hostname: url.hostname,
    imageUrl: youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null,
    siteName: youtubeId ? "YouTube" : null,
    provider: youtubeId ? "youtube" : null,
  };
}

export function parseLinkPreviewHtml(url: URL, html: string): LinkPreviewMetadata {
  const fallback = fallbackLinkPreview(url);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const siteName = cleanText(getMetaTag(html, "og:site_name"), MAX_SITE_NAME_LENGTH);
  const title = cleanText(
    getMetaTag(html, "og:title") ?? getMetaTag(html, "twitter:title") ?? titleMatch?.[1],
    MAX_TITLE_LENGTH,
  );
  const description = cleanText(
    getMetaTag(html, "og:description")
      ?? getMetaTag(html, "twitter:description")
      ?? getMetaTag(html, "description"),
    MAX_DESCRIPTION_LENGTH,
  );
  const imageUrl = safeImageUrl(
    getMetaTag(html, "og:image") ?? getMetaTag(html, "twitter:image"),
    url,
  );

  return {
    ...fallback,
    title: title ?? fallback.title,
    description,
    imageUrl: imageUrl ?? fallback.imageUrl,
    siteName: siteName ?? fallback.siteName,
  };
}