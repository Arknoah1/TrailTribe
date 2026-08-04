import { rateLimit } from "express-rate-limit";

/**
 * Shared rate limiter for guessable public-lookup endpoints:
 * invite codes, calendar tokens, and similar token-based URLs.
 * 20 requests per 15 minutes per IP.
 */
export const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
