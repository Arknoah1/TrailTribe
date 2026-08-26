/** Customer-visible fallback identity for transactional email. */
// This sender needs a verified Resend domain with SPF/DKIM before mail can deliver reliably.
export const DEFAULT_FROM_ADDRESS = "TrailTeam <noreply@trailteam.app>";