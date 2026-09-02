/** Customer-visible fallback identity for transactional email. */
// Mail is sent via Gmail SMTP (smtp.gmail.com), authenticated as SMTP_USER.
// This address must be that same Gmail mailbox (or a verified "Send As"
// alias on it) — trailteam.app has no mail server of its own.
export const DEFAULT_FROM_ADDRESS = "Methow Cycling Team <admin@methowcyclingteam.com>";

export const APPROVED_SENDER_NAME = "Methow Cycling Team";
export const APPROVED_SENDER_MAILBOXES = [
  "admin@methowcyclingteam.com",
  "coaches@methowcyclingteam.com",
] as const;

const FROM_ADDRESS_FORMAT = /^(.+?)\s*<([^<>@\s]+@[^<>@\s]+)>$/;

/**
 * Reject sender identities that could expose stale branding or an unverified
 * mailbox. Keeping this check here makes every email configuration entry
 * point to the same approved identity, including deployment overrides.
 */
export function validateFromAddress(fromAddress: string): void {
  const match = FROM_ADDRESS_FORMAT.exec(fromAddress.trim());
  const displayName = match?.[1]?.trim();
  const mailbox = match?.[2]?.trim().toLowerCase();

  if (
    displayName !== APPROVED_SENDER_NAME ||
    !mailbox ||
    !APPROVED_SENDER_MAILBOXES.includes(
      mailbox as (typeof APPROVED_SENDER_MAILBOXES)[number],
    )
  ) {
    throw new Error(
      `Invalid EMAIL_FROM "${fromAddress}". Expected the display name "${APPROVED_SENDER_NAME}" and an approved sender mailbox: ${APPROVED_SENDER_MAILBOXES.join(", ")}.`,
    );
  }
}

export function resolveFromAddress(configuredFromAddress?: string | null): string {
  const resolvedAddress = configuredFromAddress?.trim() || DEFAULT_FROM_ADDRESS;
  validateFromAddress(resolvedAddress);
  return resolvedAddress;
}
