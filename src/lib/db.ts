import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { env } from "./env";

/**
 * Data access layer.
 *
 * Locally this is an embedded PGlite database (WASM Postgres) persisted to
 * ./.pgdata — zero setup, same SQL dialect as production. In production you set
 * DATABASE_URL to a Neon POOLED connection string (§9.2) and swap the driver
 * here for `pg`/`postgres`; every query in the app goes through the `query`,
 * `queryOne`, and `tx` helpers below, so that swap is genuinely one file.
 *
 * The PGlite instance is cached on globalThis so Next's dev hot-reload and the
 * multiple module contexts of a route handler all share a single connection
 * (PGlite is single-connection; sharing it is required for correctness).
 */

type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface DbGlobal {
  pg?: PGlite;
  ready?: Promise<PGlite>;
}

const g = globalThis as unknown as { __olympicsDb?: DbGlobal };
g.__olympicsDb ??= {};

async function init(): Promise<PGlite> {
  if (env.databaseUrl) {
    // Production path. Intentionally guarded: install `pg` and implement the
    // Queryable interface against a pooled client, then return it here.
    throw new Error(
      "DATABASE_URL is set but the Postgres driver is not wired in this build. " +
        "Local/demo runs use embedded PGlite (leave DATABASE_URL unset). " +
        "For Neon, implement the `pg` client behind the Queryable interface in src/lib/db.ts."
    );
  }

  const dir = path.resolve(process.cwd(), env.pgDataDir);
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;

  // Apply schema (idempotent). Safe to run on every cold start.
  const schema = fs.readFileSync(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
  await pg.exec(schema);

  g.__olympicsDb!.pg = pg;
  return pg;
}

export function getDb(): Promise<PGlite> {
  const store = g.__olympicsDb!;
  if (store.pg) return Promise.resolve(store.pg);
  store.ready ??= init();
  return store.ready;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a single serializable transaction. Used for the atomic
 * capacity check (§9.2): SELECT ... FOR UPDATE on the event row serializes
 * contenders for that event so registration can never oversell.
 */
export async function tx<T>(fn: (t: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (t) => {
    const wrapped: Queryable = {
      query: <R = Row>(sql: string, params?: unknown[]) => t.query<R>(sql, params),
    };
    return fn(wrapped);
  }) as Promise<T>;
}
