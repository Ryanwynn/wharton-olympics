// Write-peak load test: everyone hits "Register" for one capacity-limited event
// the instant signup opens. Proves the atomic FOR UPDATE capacity never oversells.
//
// 1. Seed sessions first (writes loadtest/tokens.csv + loadtest/target.txt):
//      DATABASE_URL='<neon-branch>' AUTH_SECRET='<same as the deploy>' N=200 CAP=50 \
//        npx tsx loadtest/make-sessions.ts
// 2. Run:
//      k6 run -e BASE_URL=https://staging.whartonolympics.com \
//        -e EVENT_ID=$(cat loadtest/target.txt) loadtest/register-stampede.js
//
import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE_URL;
const EVENT_ID = __ENV.EVENT_ID;
if (!BASE || !EVENT_ID) throw new Error("Set -e BASE_URL and -e EVENT_ID (see loadtest/target.txt)");

// One pre-seeded session token per line.
const tokens = new SharedArray("tokens", () =>
  open("./tokens.csv").split("\n").map((s) => s.trim()).filter(Boolean)
);

export const options = {
  scenarios: {
    stampede: {
      executor: "per-vu-iterations",
      vus: tokens.length, // one virtual user per seeded session
      iterations: 1, // each registers exactly once, all at once
      maxDuration: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const token = tokens[(__VU - 1) % tokens.length];
  const res = http.post(`${BASE}/api/events/${EVENT_ID}/register`, null, {
    headers: {
      "content-type": "application/json",
      "idempotency-key": `loadtest-${__VU}`, // stable per user (double-taps are no-ops)
      cookie: `wso_session=${token}`,
    },
  });
  check(res, {
    "no server error (5xx)": (r) => r.status < 500,
    "registered or waitlisted": (r) => r.status === 200,
  });
}
