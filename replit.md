# Trail Blazers Team Management App

## Overview

A full-stack, mobile-responsive web app for a high school mountain bike team to manage rosters, schedules, carpools, and communications — designed as a TeamSnap alternative with reduced notification fatigue.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite (TBD — pending design decisions)
- **Auth**: Clerk (TBD)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Styling**: Tailwind CSS, rugged outdoor dark-mode theme

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema (Drizzle ORM)

Tables defined in `lib/db/src/schema/`:

| File | Tables |
|------|--------|
| `households.ts` | `households` — family unit, invite code, compliance docs |
| `users.ts` | `users` — parents, students, coaches, admins; medical info, notification prefs, `calendarToken` (unique iCal feed token) |
| `pods.ts` | `pods` — team sub-groups with coaches |
| `trailheads.ts` | `trailheads` — saved GPS/Maps locations library |
| `events.ts` | `events`, `event_rsvps`, `volunteer_signups` — practices, races, socials |
| `carpools.ts` | `carpool_offers`, `carpool_claims` — driver seats + bike trays |
| `invite_links.ts` | `invite_links` — permanent onboarding links per household/pod |
| `messages.ts` | `broadcasts` — coach messages with dedup logic |

## Five Primary Views (Planned)

1. **Calendar View** — Practices, Races, Socials; RSVP, Volunteer sign-up, Google Maps links, iCal feed
2. **Roster View** — Grouped by Household & Pod; compliance checklist
3. **Messaging Hub** — Coach broadcasts to pods/team; notification deduplication
4. **Carpool View** — Per-event seat + bike tray sign-up
5. **Admin Dashboard** — Invite links, Trailhead library, Surveys, Season Archive

## Special Features

- Unique invite links per household/pod
- iCal feed URL per pod for Google/Apple Calendar sync
- Offline Service Worker caching (current week + emergency contacts)
- Medical info restricted to coaches/admins
- Notification deduplication (coach+parent = 1 notification)
- Twilio (SMS) + SMTP (Email) via environment variable placeholders

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
