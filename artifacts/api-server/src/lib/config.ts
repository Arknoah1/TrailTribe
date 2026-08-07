/**
 * Resolves the base URL used when building invite links.
 *
 * Resolution order:
 *   1. APP_BASE_URL env var (explicit override, e.g. in production)
 *   2. REPLIT_DEV_DOMAIN + FRONTEND_BASE_PATH (Replit dev environment)
 *   3. Empty string — caller should warn when this happens
 */
export function getAppBase(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const basePath = process.env.FRONTEND_BASE_PATH ?? "/trailtribe";
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}${basePath}`
    : "";
}
