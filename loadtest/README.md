# Load testing (200 simultaneous users)

Two experiments, matching the two load shapes the app is built for:

- **`scoreboard.js`** — 200 users polling the public scoreboard (read peak). Proves the CDN cache holds so the database barely moves.
- **`register-stampede.js`** — 200 users registering for one 50-seat event at once (write peak). Proves the atomic capacity never oversells.

## 0. Prerequisites

- **k6**: `brew install k6` (macOS) — see https://k6.io/docs/get-started/installation/
- **Node** (already have it) for the session seeder.

## 1. Set up a SAFE target (never hammer production)

1. In Neon, **create a branch** of your database (Branches → New branch). Copy its **pooled** connection string.
2. Deploy a **Vercel preview** that points at the branch: set that project/preview's `DATABASE_URL` to the branch string. Note its URL, e.g. `https://wharton-olympics-staging.vercel.app` — this is your `BASE_URL`.
3. Note the deployment's `AUTH_SECRET` (you'll need the *same* value to mint valid sessions).

> Why a branch: writes from the stampede won't touch real signups, and you can throw the branch away afterwards.

## 2. Read test (scoreboard)

```bash
k6 run -e BASE_URL=https://wharton-olympics-staging.vercel.app loadtest/scoreboard.js
```

Ramps to 200 virtual users, holds 10 min, polling `/api/standings` + `/api/schedule` every ~15s (like the real client).

**Pass:**
- `http_req_duration p(95) < 300ms`, `http_req_failed < 1%` (k6 prints these; green = pass).
- The `served from edge cache` check is mostly ✓ (responses are `X-Vercel-Cache: HIT/STALE`).
- In the **Neon dashboard**, active connections stay flat as VUs climb — that's the caching doing its job.

## 3. Write test (registration stampede)

**a. Seed 200 sessions + the target event** (run with the branch URL and the matching secret):

```bash
DATABASE_URL='postgres://…neon-branch-pooler…/db?sslmode=require' \
AUTH_SECRET='the-same-AUTH_SECRET-as-the-deploy' \
N=200 CAP=50 \
npx tsx loadtest/make-sessions.ts
```

This writes `loadtest/tokens.csv` (session cookies) and `loadtest/target.txt` (the event id).

**b. Run the stampede:**

```bash
k6 run -e BASE_URL=https://wharton-olympics-staging.vercel.app \
       -e EVENT_ID=$(cat loadtest/target.txt) \
       loadtest/register-stampede.js
```

All 200 fire a register within a few seconds, each as a different authenticated user.

**c. Verify integrity** in the Neon SQL editor (this is the real pass/fail):

```sql
SELECT status, count(*) FROM registrations
 WHERE event_id = '<paste loadtest/target.txt>' GROUP BY status;
-- expect exactly: registered = 50, waitlisted = 150

SELECT user_id, count(*) FROM registrations
 WHERE event_id = '<same>' AND status <> 'withdrawn'
 GROUP BY user_id HAVING count(*) > 1;
-- expect: 0 rows (no duplicates)
```

**Pass:** exactly 50 `registered`, 150 `waitlisted`, zero duplicates, and k6 shows zero 5xx.

## 4. Clean up

Run `loadtest/cleanup.sql` against the branch (Neon SQL editor), then delete the Neon branch and the preview deployment. `tokens.csv` / `target.txt` are git-ignored — delete them locally too.

## Notes

- 200 VUs runs fine from one machine; run it from a cloud VM if your home uplink is the bottleneck.
- `AUTH_SECRET` mismatch is the usual gotcha — the seeded session cookies only validate if the secret matches the deployment.
- Keep runs bounded (the 10-min hold) so you stay within Vercel Hobby function quotas; a Pro plan gives headroom for the real event.
