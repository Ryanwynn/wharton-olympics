/**
 * Apply the schema. For PGlite this is idempotent (getDb runs db/schema.sql on
 * init). For Neon, apply db/schema.neon.sql with psql instead.
 */
import "./_loadenv";
import { getDb, query } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const tables = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  console.log(`✓ schema applied — ${tables[0].n} tables in public.`);
  await db.close?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
