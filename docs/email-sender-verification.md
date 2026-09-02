# Transactional email sender verification

## Verification result

The production sender identity was checked after deployment on September 1, 2026:

- A controlled transactional message was accepted by Gmail SMTP.
- The receiving inbox displayed **Methow Cycling Team** as the sender name.
- The effective sending address remained `coaches@methowcyclingteam.com`.
- The message included the configured Reply-To header.
- Production inherited `EMAIL_FROM=Methow Cycling Team <coaches@methowcyclingteam.com>`; no production-specific override restored the old TrailTeam sender name.
- The API validates `EMAIL_FROM` during startup and immediately before each send. Only the **Methow Cycling Team** display name with an approved `@methowcyclingteam.com` mailbox is accepted; an invalid override aborts startup or returns a failed send without contacting SMTP.

## Repeat the check

Run the API sender verification command with a real receiving inbox:

```sh
EMAIL_TEST_TO="recipient@example.com" \
EMAIL_TEST_REPLY_TO="reply@example.com" \
pnpm --filter @workspace/api-server run email:verify-sender
```

The command reports SMTP acceptance, the effective From header, and whether Reply-To was included. SMTP acceptance does not prove how an email client renders the message, so finish the check in the receiving inbox:

1. Open the message titled **Sender name verification — Methow Cycling Team**.
2. Confirm the visible sender name is **Methow Cycling Team**.
3. Confirm the sending address is still `coaches@methowcyclingteam.com`.
4. Start a reply and confirm it targets the expected Reply-To address.

## Sender configuration guard

The sender display name is intentionally fixed in the API. The approved
mailbox allowlist can be supplied through deployment configuration:

- `EMAIL_APPROVED_SENDER_MAILBOXES` — optional comma-separated mailbox
  allowlist. When omitted, the defaults are
  `admin@methowcyclingteam.com` and `coaches@methowcyclingteam.com`.
- `EMAIL_FROM` — complete From header, for example
  `Methow Cycling Team <coaches@methowcyclingteam.com>`.

An explicitly configured allowlist replaces the defaults. Each mailbox must be
verified with the Gmail account used by `SMTP_USER` before it is added. The API
rejects malformed allowlist entries, stale display names, unapproved mailboxes,
and bare email addresses. Invalid configuration aborts startup, and changing
either setting while the API is running is revalidated before the next send.

## Rotate the verified mailbox

1. In Gmail, verify the new address as a **Send mail as** address for the
   account used by `SMTP_USER`. Finish Gmail's confirmation step before
   changing the deployment.
2. In the deployment environment, set both values together. For example:

   ```sh
   EMAIL_APPROVED_SENDER_MAILBOXES=billing@methowcyclingteam.com
   EMAIL_FROM="Methow Cycling Team <billing@methowcyclingteam.com>"
   ```

   For multiple verified mailboxes, separate them with commas.
3. Restart or redeploy the API. A typo in either value should prevent startup
   rather than sending with an unapproved identity.
4. Run the sender verification command from the deployment environment:

   ```sh
   EMAIL_TEST_TO="recipient@example.com" \
   EMAIL_TEST_REPLY_TO="reply@example.com" \
   pnpm --filter @workspace/api-server run email:verify-sender
   ```

5. In the receiving inbox, confirm the visible sender name is **Methow Cycling
   Team**, the address is the new mailbox, and replies target the expected
   Reply-To address.
