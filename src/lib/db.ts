import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { env } from "./env";

/**
 * Data access layer.
 *
 * Local development uses an embedded PGlite database persisted to ./.pgdata.
 * Production uses Postgres.js against DATABASE_URL (the pooled Neon URL).
 * Every query in the app goes through query/queryOne/tx, so both backends expose
 * the same tiny interface and transaction semantics.
 */

type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Database extends Queryable {
  transaction<T>(fn: (t: Queryable) => Promise<T>): Promise<T>;
  close?: () => Promise<void>;
}

interface DbGlobal {
  db?: Database;
  ready?: Promise<Database>;
}

const g = globalThis as unknown as { __olympicsDb?: DbGlobal };
g.__olympicsDb ??= {};

type PostgresSql = ReturnType<typeof postgres>;
type PostgresQueryable = Pick<PostgresSql, "unsafe">;

function postgresQueryAdapter(client: PostgresQueryable): Queryable {
  return {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      // SQL text and placeholders are defined by the application; values remain
      // separate protocol parameters. `never[]` narrows our generic unknown[] to
      // Postgres.js' serializable-parameter type without changing runtime values.
      const rows = await client.unsafe<T[]>(sql, params as never[]);
      return { rows: Array.from(rows) };
    },
  };
}

function wrapPostgres(sql: PostgresSql): Database {
  const queryable = postgresQueryAdapter(sql);
  return {
    query: queryable.query,
    transaction<T>(fn: (t: Queryable) => Promise<T>) {
      // begin() reserves one physical connection for the whole callback, which
      // preserves SELECT ... FOR UPDATE and the app's other atomic workflows.
      return sql.begin(async (txSql) => fn(postgresQueryAdapter(txSql))) as Promise<T>;
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

function wrapPGlite(pg: PGlite): Database {
  return {
    query: <T = Row>(sql: string, params: unknown[] = []) => pg.query<T>(sql, params),
    transaction<T>(fn: (t: Queryable) => Promise<T>) {
      return pg.transaction(async (t) => {
        const wrapped: Queryable = {
          query: <R = Row>(sql: string, params?: unknown[]) => t.query<R>(sql, params),
        };
        return fn(wrapped);
      }) as Promise<T>;
    },
    close: () => pg.close(),
  };
}

async function init(): Promise<Database> {
  if (env.databaseUrl) {
    const sql = postgres(env.databaseUrl, {
      // Neon pooled URLs use PgBouncer transaction pooling. Disabling automatic
      // prepared statements avoids session-level prepared-statement assumptions.
      prepare: false,
      // Keep each warm serverless instance conservative with DB connections.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    return wrapPostgres(sql);
  }

  const dir = path.resolve(process.cwd(), env.pgDataDir);
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;

  // Apply the local schema on startup. Production schema is applied once to Neon
  // using db/schema.neon.sql; it is intentionally not mutated on every cold start.
  const schema = fs.readFileSync(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
  await pg.exec(schema);

  return wrapPGlite(pg);
}

export function getDb(): Promise<Database> {
  const store = g.__olympicsDb!;
  if (store.db) return Promise.resolve(store.db);

  store.ready ??= init().then((db) => {
    store.db = db;
    return db;
  });
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
 * Run `fn` inside a single transaction. Registration uses this for the atomic
 * capacity check: SELECT ... FOR UPDATE serializes contenders for an event so
 * registration cannot oversell.
 */
export async function tx<T>(fn: (t: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}
