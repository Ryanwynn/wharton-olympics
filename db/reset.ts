/**
 * Full local reset: delete the embedded PGlite data dir, recreate the schema, and
 * reseed. Do NOT run while the dev server is up — PGlite is single-process.
 */
import "./_loadenv";
import fs from "node:fs";
import path from "node:path";
import { env } from "../src/lib/env";

async function main() {
  const dir = path.resolve(process.cwd(), env.pgDataDir);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`↳ removed ${env.pgDataDir}`);
  }
  // Import after wipe so the DB is created fresh.
  const { seed } = await import("./seed");
  const { getDb } = await import("../src/lib/db");
  await seed();
  await (await getDb()).close?.();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
