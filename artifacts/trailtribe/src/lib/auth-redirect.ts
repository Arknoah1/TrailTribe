const SAFE_REDIRECT_PATHS = [
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

function isSafeRedirectPath(path: string): boolean {
  return SAFE_REDIRECT_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Converts an internal absolute redirect URL into a relative route that Clerk
 * can return to after authentication. External URLs and unknown routes are
 * rejected to prevent an email query parameter from becoming an open redirect.
 */
export function getSafeRedirectUrl(
  rawRedirect: string | null | undefined,
  currentOrigin: string,
): string | null {
  if (!rawRedirect) return null;

  try {
    const parsed = new URL(rawRedirect, currentOrigin);
    const allowedOrigins = new Set([currentOrigin]);
    if (!allowedOrigins.has(parsed.origin)) return null;

    const route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isSafeRedirectPath(route) ? route : null;
  } catch {
    return null;
  }
}

export function getRedirectUrlFromSearch(
  search: string,
  currentOrigin: string,
): string | null {
  return getSafeRedirectUrl(
    new URLSearchParams(search).get("redirect_url"),
    currentOrigin,
  );
}