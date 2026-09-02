/** Customer-visible fallback identity for transactional email. */
// Mail is sent via Gmail SMTP (smtp.gmail.com), authenticated as SMTP_USER.
// This address must be that same Gmail mailbox (or a verified "Send As"
// alias on it) — trailteam.app has no mail server of its own.
export const DEFAULT_FROM_ADDRESS = "Methow Cycling Team <admin@methowcyclingteam.com>";

export const APPROVED_SENDER_NAME = "Methow Cycling Team";
export const DEFAULT_APPROVED_SENDER_MAILBOXES = [
  "admin@methowcyclingteam.com",
  "coaches@methowcyclingteam.com",
] as const;

// A deployment can replace the default allowlist with a comma-separated list
// after each mailbox has been verified with the SMTP provider.
export const APPROVED_SENDER_MAILBOXES = DEFAULT_APPROVED_SENDER_MAILBOXES;

const FROM_ADDRESS_FORMAT = /^(.+?)\s*<([^<>@\s]+@[^<>@\s]+)>$/;
const MAILBOX_FORMAT = /^[^<>@\s]+@[^<>@\s]+$/;

/**
 * Resolve the sender mailbox allowlist from deployment configuration.
 *
 * The display name remains code-owned, while operators can rotate verified
 * mailboxes without changing source code. An explicitly configured list
 * replaces the built-in defaults instead of expanding them accidentally.
 */
export function resolveApprovedSenderMailboxes(
  configuredMailboxes = process.env.EMAIL_APPROVED_SENDER_MAILBOXES,
): string[] {
  const rawMailboxes = configuredMailboxes?.trim();
  if (!rawMailboxes) return [...DEFAULT_APPROVED_SENDER_MAILBOXES];

  const mailboxes = rawMailboxes
    .split(",")
    .map((mailbox) => mailbox.trim().toLowerCase())
    .filter(Boolean);
  const invalidMailboxes = mailboxes.filter(
    (mailbox) => !MAILBOX_FORMAT.test(mailbox),
  );

  if (mailboxes.length === 0 || invalidMailboxes.length > 0) {
    throw new Error(
      `Invalid EMAIL_APPROVED_SENDER_MAILBOXES "${configuredMailboxes}". Expected a comma-separated list of mailbox addresses.`,
    );
  }

  return [...new Set(mailboxes)];
}

/**
 * Reject sender identities that could expose stale branding or an unverified
 * mailbox. Keeping this check here makes every email configuration entry
 * point to the same approved identity, including deployment overrides.
 */
export function validateFromAddress(
  fromAddress: string,
  approvedMailboxes = resolveApprovedSenderMailboxes(),
): void {
  const match = FROM_ADDRESS_FORMAT.exec(fromAddress.trim());
  const displayName = match?.[1]?.trim();
  const mailbox = match?.[2]?.trim().toLowerCase();

  if (
    displayName !== APPROVED_SENDER_NAME ||
    !mailbox ||
    !approvedMailboxes.includes(mailbox)
  ) {
    throw new Error(
      `Invalid EMAIL_FROM "${fromAddress}". Expected the display name "${APPROVED_SENDER_NAME}" and an approved sender mailbox: ${approvedMailboxes.join(", ")}.`,
    );
  }
}

export function resolveFromAddress(
  configuredFromAddress?: string | null,
  configuredApprovedMailboxes = process.env.EMAIL_APPROVED_SENDER_MAILBOXES,
): string {
  const resolvedAddress = configuredFromAddress?.trim() || DEFAULT_FROM_ADDRESS;
  const approvedMailboxes =
    resolveApprovedSenderMailboxes(configuredApprovedMailboxes);
  validateFromAddress(resolvedAddress, approvedMailboxes);
  return resolvedAddress;
}
