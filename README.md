# Wharton Student Olympics

A mobile-first web app for Wharton's annual student olympics: register for events, form teams, follow a live schedule, and watch cluster standings update in real time. Built to the spec in `wharton-olympics-spec.md`.

> A student organization at the University of Pennsylvania. Not affiliated with, endorsed by, or sponsored by the Wharton School or the University of Pennsylvania.

## Quick start

```bash
npm install
npm run db:reset   # creates an embedded Postgres (PGlite) under ./.pgdata and seeds ~500 users, 10 events, 4 clusters
npm run dev        # http://localhost:3000
```

No database server, Docker, or cloud account is needed to run locally. Sign in with any `@upenn.edu` (or school subdomain) address — the dev mailer prints the 6-digit code on screen instead of emailing it. Seeded admins: `admin@wharton.upenn.edu` and `ryanwynn17@gmail.com` (the `gmail.com` allowance is a local-dev convenience in `.env.local`; remove it for production).

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
| `npm test` | Unit tests for the pure logic (`node:test`) |
| `npm run db:reset` | Wipe + recreate + reseed the local DB |
| `npm run db:seed` / `db:migrate` | Seed / apply schema only |
| `npx tsx db/stampede-test.ts` | The no-oversell registration stress test (§9.3 scenario 2) |

## Architecture

- **Next.js 14 (App Router) + TypeScript + Tailwind.** Server components render the public pages; the live-updating parts poll cached JSON endpoints.
- **Database access is a single interface** (`src/lib/db.ts`: `query`, `queryOne`, `tx`). Locally it is **PGlite** — an embedded WASM Postgres, same SQL dialect as production, persisted to `./.pgdata`. For production you set `DATABASE_URL` to a **Neon pooled** connection string and implement the same interface with `pg`; every query in the app already goes through it, so the swap is one file.
- **The 500-concurrent read peak is solved at the edge, not the database** (§9.1). `/api/standings` and `/api/schedule` send `Cache-Control: public, s-maxage=10, stale-while-revalidate=60`, so the CDN serves ~99% of hits and the origin sees ~one query every 10s regardless of audience size. Finalizing an event calls `revalidatePath` to bust that cache immediately.
- **The write peak (registration) is enforced atomically** (§9.2). `src/lib/registration.ts` locks the event row with `SELECT … FOR UPDATE`, counts, then inserts inside one transaction — it cannot oversell. Register calls honor an `Idempotency-Key` header so mobile double-taps don't double-register.

### Layout

```
db/                     schema.sql (local) · schema.neon.sql (prod, verbatim §7) · seed.ts · stampede-test.ts
src/app/                pages (/ /events /me /admin /score/[id] /signin) + /api route handlers
src/lib/                db, auth, email, crypto, ratelimit, registration, queries, adminQueries, time, format
src/components/         Scoreboard, EventsBrowser, MyEvents, AdminConsole, ScoreEntry, MascotIcon, …
```

## What's implemented

All five milestones (M0–M4):

- **Public scoreboard + schedule** — live cluster standings (the signature element: tabular figures, mascot icons, rank-change movement, quiet pulse on update), "happening now" strip, single-day filterable schedule with inline results, 15s polling with jitter, `visibilitychange` pause/resume, `aria-live`, last-updated stamp.
- **Passwordless auth** — 6-digit CSPRNG codes hashed with HMAC-SHA256, 10-min TTL, single-use, 5-attempt lockout, constant-time compare, no user enumeration, plus-address stripping, DB-backed rate limits, 30-day participant / 12-hour privileged sessions.
- **Registration + teams** — every button state in §6.2, atomic capacity, waitlists with positions + auto-promotion, idempotency, withdraw, schedule-conflict warnings (flagged, never blocked), team create/join/leave with invite codes and min-size `forming` gating, `/me` agenda with `.ics` export.
- **Admin console** — event CRUD, draft/publish, per-event roster with conflict badges, waitlist promote, manual add, CSV export (audit-logged), user search + role grants, scorekeeper→event assignment, audit log.
- **Scorekeeper entry** (`/score/:id`) — stripped-down, large tap targets, placement→points auto-fill from the event's schema (editable), **offline-tolerant**: optimistic local writes, a retry queue with exponential backoff persisted to `localStorage`, per-row sync indicators, and "Mark event final" with on-demand cache revalidation.

### Post-v1 enhancements (owner-requested)

- **Withdraw confirmation** — an "are you sure?" dialog gates every withdraw / leave-team action.
- **Code-free team join** — team events show open teams you can join with one tap (invite codes are now optional, shown to captains for sharing).
- **One-click role grants** — the admin People tab grants admin/scorekeeper *by email*, even before the person has signed in (pre-registered, active on first login) — the easy path for adding day-of scorekeepers.
- **Live scores** — scorekeepers post a free-text running score (e.g. "Lions 40 – Tigers 50") on an in-progress event; it shows in the public "happening now" strip, separate from final placement/points.
- **Tournament brackets** — single-elimination brackets (`bracket_matches` table): generate from the registered entrants, enter per-match scores, and winners auto-advance each round. Public live bracket at `/bracket/:eventId`; editable bracket on the scorekeeper page. Works for team or individual events. (The original spec deferred bracket progression to "flag, don't build" — added here at the owner's request.)

### Verified against the acceptance criteria (§16)

| Criterion | Status |
|---|---|
| 300 registrations for a 50-slot event → exactly 50 registered, rest waitlisted, zero duplicates | ✅ `db/stampede-test.ts` |
| Code brute force blocked after 5 attempts; per-email/IP rate limits | ✅ |
| Admin endpoints reject participant sessions **at the server** (not just hidden UI) | ✅ (403 by direct API call) |
| Scorekeeper entry survives a network drop and syncs on reconnect with no lost writes | ✅ persistent retry queue |
| No email address on any unauthenticated page (public rosters show first name + last initial) | ✅ |
| Footer carries the student-org disclaimer; no Wharton logo / Penn shield | ✅ |
| Cluster mascots are placeholder icons, not scraped Wharton seals | ✅ |
| Full flow on a 375px viewport | ✅ mobile-first throughout |

## What needs real infrastructure (not wired in this repo)

These are deliberately left as documented integration points — they require accounts/DNS and can't run locally:

- **Neon Postgres** — set `DATABASE_URL` (pooled) and implement the `pg` client behind the `Queryable` interface in `src/lib/db.ts`. The production schema is `db/schema.neon.sql` (verbatim §7, with `citext`); apply with `psql "$DATABASE_URL" -f db/schema.neon.sql`.
- **Amazon SES** — implement `SesMailer.sendCode` in `src/lib/email.ts` with `@aws-sdk/client-sesv2` and set `MAILER=ses`. **Submit the SES production-access request in week one** (sandbox only delivers to verified addresses). Requires a verified sending domain with **SPF, DKIM, and DMARC** or codes will land in spam at `.upenn.edu`. Template rules (code in subject + body, plain-text, no images/pixels) are encoded in the mailer contract.
- **Load testing** — `db/stampede-test.ts` covers the no-oversell logic; the 500-VU scoreboard soak (§9.3 scenario 1) should be run with **k6** against a deployed instance.
- **Accessibility audit** — the app is built to WCAG 2.1 AA (semantic tables with scoped headers, `aria-live` on the score region, visible focus, `prefers-reduced-motion`, ≥44px targets); run an automated `axe` pass against the deployed build to certify zero critical issues.

## Deploy (Vercel + Neon)

1. Create a Neon project; copy the **pooled** connection string.
2. Wire `pg` into `src/lib/db.ts` and apply `db/schema.neon.sql`.
3. Import the repo into Vercel (Hobby is fine for a non-commercial student event).
4. Set env vars (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -hex 32`), `SEED_ADMIN_EMAILS`, `ALLOWED_EMAIL_DOMAINS`, `MAILER=ses` + SES creds, `ORGANIZER_CONTACT_EMAIL`.
5. Verify the free-tier limits current at deploy time (function invocations, row/storage caps, whether the DB pauses on idle — add a keep-alive ping around the event if so).

## Security & privacy notes

- Every admin/scorekeeper route re-checks the session's role against the database on each request — hiding a UI button is never the control.
- Sessions and verification codes are stored **hashed** at rest; retention purges after 30 days (§13). A one-paragraph privacy note is at `/privacy`.
- `next` is pinned to the latest 14.2.x patch (auth-bypass CVE-2025-29927 and the DoS advisories are fixed there). A couple of range-based advisories are only fully resolved by upgrading to Next 16 (a breaking major not warranted for this app); revisit at the next major bump.
- No third-party analytics, ad pixels, or trackers.

## Open items from the spec (§15)

- **Domain & DNS ownership** for SPF/DKIM/DMARC is the slowest external dependency — find the owner (Wharton IT / program office) and start now.
- Reach out to Student Life / cluster leadership for the official seal artwork + written permission; when in hand, swap the artwork in `src/components/MascotIcon.tsx` behind the existing `icon_key` — no schema or layout change.
```
