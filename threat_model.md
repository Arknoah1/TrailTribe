# Threat Model

## Project Overview

TrailTribe is a full-stack team management web application for a high school mountain bike team, serving as a TeamSnap alternative. The stack is Node.js/Express 5 (API server), React/Vite (frontend), PostgreSQL via Drizzle ORM, Clerk for authentication, Resend for email, and Replit Object Storage for file uploads. It is deployed publicly on Replit Autoscale (`https://trail-tribe.replit.app`).

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
- **Authenticated (unapproved) ↔ Approved** — new registrants have a valid Clerk session but should not access team data until a coach approves them. **This boundary is not enforced in the middleware.**
- **Parent/Student ↔ Coach/Admin** — sensitive operations (create events, send broadcasts, manage approvals, view medical info) require coach or admin role. Enforced via `requireCoachOrAdmin` where applied.
- **API server ↔ Database** — Drizzle ORM with parameterized queries; no raw string interpolation observed in production paths (except the `clearSeedData` route which uses `sql.raw` on fixed strings).
- **API server ↔ Internal services** — `http://127.0.0.1:1106` (Replit credential sidecar); reachable from the SSRF surface in the link-preview endpoint.

## Scan Anchors

**Production entry points:**
- `artifacts/api-server/src/routes/` — all API routes; served under `/api`
- `artifacts/api-server/src/middlewares/requireAuth.ts` — authentication/authorization middleware
- `artifacts/api-server/src/routes/storage.ts` — file upload and download
- `artifacts/api-server/src/routes/board.ts` — link-preview SSRF surface

**Highest-risk areas:**
- `routes/clearSeedData.ts` — destructive data-wipe endpoint (still live in production)
- `routes/households.ts` — multiple IDOR-vulnerable PATCH/DELETE endpoints
- `routes/invites.ts` — deactivation endpoint lacks ownership check
- `routes/board.ts` — link-preview fetch has DNS rebinding SSRF risk
- `middlewares/requireAuth.ts` — `approved` flag not checked; unapproved users reach all `requireAuth` endpoints

**Public surfaces:** `/api/health`, `/api/invites/:code` (rate-limited), `/api/households/by-invite/:code` (rate-limited), `/api/calendar/:token/team.ics` (rate-limited), `/api/storage/public-objects/*`

**Dev-only / generated:** `artifacts/mockup-sandbox` (Canvas/design mockup), `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

## Threat Categories

### Spoofing

Clerk handles authentication; JWTs are validated server-side via `@clerk/express`. No spoofing of the authentication mechanism is expected. The calendar token is a UUID; guessing is infeasible with 2^122 entropy.

### Tampering

Multiple endpoints accept an object identifier in the URL without confirming the caller owns or belongs to that object:
- `PATCH /households/:id` — any user can update any household's details.
- `PATCH /households/:id/compliance` — any user can forge compliance attestations.
- `DELETE /households/:id/riders/:riderId` — any user can delete any student.
- `PATCH /invites/:id/deactivate` — any user can disable any invite link.

All API endpoints MUST verify the caller's relationship to the target object before mutating it.

### Information Disclosure

The `approved` flag is the intended gate between pending registrants and team data. It is checked only in two calendar endpoints. All other `requireAuth` routes expose the full roster, communications, carpool details, and event data to unapproved users immediately after registration.

Medical fields (allergies, medications, medicalNotes) are stripped for non-coaches at the application layer in household and user endpoints — this layer is functioning, but relies on correct code paths being reached.

### Denial of Service

The `POST /admin/clear-seed-data` endpoint is a catastrophic DoS vector: a single coach-level HTTP request permanently wipes almost all production data. This endpoint must be removed immediately.

### Elevation of Privilege

The `approved` bypass described above allows any self-registered user to read the entire roster without being vetted. The household compliance forgery allows parents to mark legal documents as signed without actually signing them.

### SSRF

`GET /board/link-preview` resolves DNS to block private IPs, then calls `fetch(url)` in a separate operation. DNS rebinding can cause the second resolution to return a private IP, allowing the server to reach internal services including the credential sidecar at `http://127.0.0.1:1106`.
