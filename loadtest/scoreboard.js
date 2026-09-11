// Read-peak load test: 200 users polling the public scoreboard like the real app.
// Proves the CDN caching holds (origin/DB barely moves regardless of viewers).
//
//   k6 run -e BASE_URL=https://staging.whartonolympics.com loadtest/scoreboard.js
//
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error("Set -e BASE_URL=https://your-staging-url");

export const options = {
  scenarios: {
    scoreboard: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 200 }, // ramp up
        { duration: "10m", target: 200 }, // hold at 200
        { duration: "20s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% errors
    http_req_duration: ["p(95)<300"], // p95 < 300ms (spec §12.5 / §16)
  },
};

export default function () {
  // Mirror the real client: poll both cached endpoints together, ~every 15s ± jitter.
  const res = http.batch([
    ["GET", `${BASE}/api/standings`],
    ["GET", `${BASE}/api/schedule`],
  ]);
  for (const r of res) {
    check(r, {
      "status 200": (x) => x.status === 200,
      "served from edge cache": (x) => /HIT|STALE/.test(x.headers["X-Vercel-Cache"] || ""),
    });
  }
  sleep(15 + (Math.random() * 3 - 1.5)); // 15s ± 1.5s
}
