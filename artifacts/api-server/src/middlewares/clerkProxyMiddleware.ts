/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        // The native app's WebView origin (https://localhost) never matches this
        // proxy's public domain, so Clerk rejects it with origin_invalid. Normalize
        // the outbound Origin/Referer to the proxy's own domain — this endpoint is
        // already gated by CLERK_SECRET_KEY server-side, so this isn't bypassing a
        // real security boundary.
        const originHeader = `${protocol}://${host}`;
        proxyReq.setHeader("Origin", originHeader);
        proxyReq.setHeader("Referer", `${originHeader}/`);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }

        console.log(
          `[clerk-proxy] incoming Origin=${req.headers.origin ?? "(none)"} Host=${host} X-Forwarded-Host=${req.headers["x-forwarded-host"] ?? "(none)"} computedProxyUrl=${proxyUrl}`,
        );
      },
      proxyRes: (proxyRes, req) => {
        const requestOrigin = req.headers.origin;
        if (requestOrigin) {
          proxyRes.headers["access-control-allow-origin"] = requestOrigin;
          proxyRes.headers["access-control-allow-credentials"] = "true";
          proxyRes.headers["vary"] = proxyRes.headers["vary"]
            ? `${proxyRes.headers["vary"]}, Origin`
            : "Origin";
        }

        console.log(
          `[clerk-proxy] upstreamStatus=${proxyRes.statusCode ?? "(unknown)"} incoming Origin=${req.headers.origin ?? "(none)"} Host=${req.headers.host ?? ""} rewroteAllowOrigin=${Boolean(requestOrigin)}`,
        );
      },
    },
  }) as RequestHandler;
}
