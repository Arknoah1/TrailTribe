# Threat Model

## Project Overview

TrailTeam is a full-stack team management web application for a high school mountain bike team, serving as a TeamSnap alternative. The stack is Node.js/Express 5 (API server), React/Vite (frontend), PostgreSQL via Drizzle ORM, Clerk for authentication, Gmail SMTP (via nodemailer) for email, and Replit Object Storage for file uploads. It is deployed publicly on Replit Autoscale (`https://trailteam.app`).

Primary user roles: **admin**, **coach**, **parent**, **student**. New families register via invite links and require coach/admin approval before accessing team resources.

## Assets

- **Team roster and PII** — names, emails, phone numbers, home addresses, emergency contacts, and date of birth for every student. Exposure violates family privacy.
- **Medical information** — allergies, medications, and medical notes for student riders. Restricted to coaches/admins by design; exposure is a HIPAA-adjacent privacy risk.
- **Authentication credentials** — Clerk-managed; JWTs are validated server-side.
- **Calendar tokens** — per-user iCal feed tokens in `users.calendarToken`. Guessing one leaks the user's event schedule.
- **Compliance records** — liability waivers, media releases, and codes of conduct. Integrity matters for legal and insurance purposes.
- **Coach broadcasts and board threads** — internal team communications.
- **Object storage files** — uploaded attachments (team documents, event attachments). ACL-enforced; private by default.
- **GCS service credentials** — accessed via Replit sidecar at `http://127.0.0.1:1106`; exposure would allow unauthorized cloud storage access.

## Trust Boundaries

- **Browser ↔ API** — all client requests are untrusted; the API must authenticate and authorize every action server-side.
- **Unauthenticated ↔ Authenticated** — invite lookup, calendar feed, and public object serving are the only unauthenticated surfaces; all other routes require a Clerk session.
- **Authenticated (unapproved) ↔ Approved** — new registrants have a valid Clerk session but cannot access team-wide dashboards, events, pods, trailheads, carpools, board activity, volunteer participation, or roster data. `requireApproved` enforces this boundary; narrowly scoped onboarding and self-service routes remain on `requireAuth`.
- **Parent/Student ↔ Coach/Admin** — sensitive operations (create events, send broadcasts, manage approvals, view medical info) require coach or admin role. Enforced via `requireCoachOrAdmin` where applied.
- **API server ↔ Database** — Drizzle ORM with parameterized queries; no destructive production seed-clear route is registered.
- **API server ↔ Internal services** — `http://127.0.0.1:1106` (Replit credential sidecar); the link-preview endpoint resolves and validates a public IP once, then pins its outbound connection to that address.

## Scan Anchors

**Production entry points:**
- `artifacts/api-server/src/routes/` — all API routes; served under `/api`
- `artifacts/api-server/src/middlewares/requireAuth.ts` — authentication/authorization middleware
- `artifacts/api-server/src/routes/storage.ts` — file upload and download
- `artifacts/api-server/src/routes/board.ts` — link-preview SSRF surface

**Highest-risk areas:**
- **Route authorization regressions** — routes that accept household, rider, carpool, event, or board identifiers must continue to enforce `requireApproved`, coach/admin roles, or explicit ownership checks as appropriate.
- **Object storage ACLs** — user-uploaded objects fail closed when their ACL policy is missing; maintain that behavior when adding new upload paths.
- **Invite and calendar tokens** — these unauthenticated capabilities remain sensitive and must stay high-entropy, rate-limited, and revocable.
- **Outbound link previewing** — preserve the DNS-pinning control when changing the preview fetch implementation.

**Public surfaces:** `/api/health`, `/api/invites/:code` (rate-limited), `/api/households/by-invite/:code` (rate-limited), `/api/calendar/:token/team.ics` (rate-limited), `/api/storage/public-objects/*`

**Dev-only / generated:** `artifacts/mockup-sandbox` (Canvas/design mockup), `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

## Threat Categories

### Spoofing

Clerk handles authentication; JWTs are validated server-side via `@clerk/express`. No spoofing of the authentication mechanism is expected. The calendar token is a UUID; guessing is infeasible with 2^122 entropy.

### Tampering

Household and rider operations now verify that the caller is a household member or coach/admin before accessing or changing the target. Electronic consent is restricted to a household member, while coach/admin-only compliance overrides support paper forms. Carpool claims verify that a caller can act for the selected rider, and nested claim routes verify that the claim belongs to the offer in the path. Invite deactivation is coach/admin-only for this single-team deployment.

All future API endpoints that accept an object identifier MUST verify the caller's relationship to the target object before mutating it.

### Information Disclosure

The `approved` flag is the gate between pending registrants and team data. Team-wide dashboards, events, RSVP lists, pods, trailheads, carpools, board activity, volunteer task participation, and household rider records use `requireApproved` or stricter role/ownership checks. The remaining `requireAuth` routes are limited to self-service actions, invite acceptance, necessary onboarding, notifications, personal device/calendar settings, storage ACL access, and a sanitized document list without household completion counts.

Medical fields (allergies, medications, medicalNotes) are stripped for non-coaches at the application layer in household and user endpoints — this layer is functioning, but relies on correct code paths being reached.

### Denial of Service

No `POST /admin/clear-seed-data` endpoint, route registration, import, or test remains in the current codebase.

### Elevation of Privilege

No approval bypass was found in the audited team-wide routes. A parent can submit clickwrap consent only for their own household; coach/admin compliance overrides are intentionally separate for paper-form attestations.

### SSRF

`GET /board/link-preview` resolves DNS, rejects private or loopback addresses, and pins the outbound request to a validated resolved IP with redirects disabled. This prevents the prior DNS-rebinding path to internal services, including the credential sidecar at `http://127.0.0.1:1106`.
