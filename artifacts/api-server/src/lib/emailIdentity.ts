/** Customer-visible fallback identity for transactional email. */
// Mail is sent via Gmail SMTP (smtp.gmail.com), authenticated as SMTP_USER.
// This address must be that same Gmail mailbox (or a verified "Send As"
// alias on it) — trailteam.app has no mail server of its own.
export const DEFAULT_FROM_ADDRESS = "Methow Cycling Team <admin@methowcyclingteam.com>";

export function resolveFromAddress(configuredFromAddress?: string | null): string {
  return configuredFromAddress?.trim() || DEFAULT_FROM_ADDRESS;
}
