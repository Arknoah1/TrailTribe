# Transactional email sender verification

## Verification result

The production sender identity was checked after deployment on September 1, 2026:

- A controlled transactional message was accepted by Gmail SMTP.
- The receiving inbox displayed **Methow Cycling Team** as the sender name.
- The effective sending address remained `coaches@methowcyclingteam.com`.
- The message included the configured Reply-To header.
- Production inherited `EMAIL_FROM=Methow Cycling Team <coaches@methowcyclingteam.com>`; no production-specific override restored the old TrailTeam sender name.

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