/**
 * Minimal .env loader for the standalone db scripts. Next.js loads .env.local
 * automatically, but `tsx db/*.ts` does not — without this the seed would run with
 * an empty SEED_ADMIN_EMAILS and never flag the admins. Imported first in each
 * script so process.env is populated before src/lib/env.ts is evaluated.
 */
import fs from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue; // skips blank lines and comments (# ...)
    const key = m[1];
    if (process.env[key] !== undefined) continue; // real env wins over file
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
