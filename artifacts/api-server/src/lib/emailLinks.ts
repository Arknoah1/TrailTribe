import { getAppBase } from "./config";

export interface EmailLink {
  label: string;
  href: string;
}

const ALLOWED_PATHS = [
  /^\/events\/\d+(?:\?focus=volunteer)?$/,
  /^\/messages(?:\/thread\/\d+)?(?:\?tab=(?:events|pod|announcements))?$/,
  /^\/carpools(?:\/\d+)?$/,
  /^\/profile(?:\?tab=family)?$/,
  /^\/admin$/,
  /^\/reenroll$/,
  /^\/dashboard$/,
  /^\/calendar$/,
  /^\/family-invite\/[A-Za-z0-9]+$/,
  /^\/rider-invite\/[A-Za-z0-9]+$/,
  /^\/join\/[A-Za-z0-9]+$/,
] as const;

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Builds an absolute link on the configured public app origin.
 *
 * Email links intentionally accept only known internal routes. This keeps
 * future callers from accidentally turning an email into an open redirect or
 * putting an arbitrary external URL in a transactional message.
 */
export function buildAppUrl(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || !isAllowedPath(path)) {
    return null;
  }

  const appBase = getAppBase();
  return appBase ? `${appBase}${path}` : null;
}

export function createEmailLink(path: string, label: string): EmailLink | null {
  const href = buildAppUrl(path);
  return href ? { href, label } : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns matching plain-text and HTML alternatives for the same email body.
 * User-provided text is escaped before it is placed in HTML.
 */
export function addEmailLinks(
  text: string,
  links: Array<EmailLink | null>,
): { text: string; html?: string } {
  const validLinks = links.filter((link): link is EmailLink => link !== null);
  if (validLinks.length === 0) return { text };

  const textLinks = validLinks.map((link) => `${link.label}: ${link.href}`).join("\n");
  const htmlBody = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const htmlLinks = validLinks
    .map(
      (link) =>
        `<p><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:12px 18px;background:#00c2a8;color:#0a0c10;font-weight:700;text-decoration:none;border:2px solid #0a0c10;border-radius:8px">${escapeHtml(link.label)}</a></p>`,
    )
    .join("");

  return {
    text: `${text}\n\n${textLinks}`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f6;color:#0a0c10;font-family:Arial,sans-serif;line-height:1.5"><main style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border:1px solid #d9dde2;border-radius:12px">${htmlBody}${htmlLinks}<p style="font-size:12px;color:#59636e">If the button does not work, copy and paste the link from the plain-text version of this email.</p></main></body></html>`,
  };
}