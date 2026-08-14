import { query } from "./db";
import type { Queryable } from "./db";

/**
 * Append to the audit log (§6.4, §7). Every privileged write — score entry, role
 * grant, roster override, CSV export — records actor + timestamp + before/after.
 * Pass a transaction handle `t` to log within the same transaction as the change.
 */
export async function writeAudit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
  t?: Queryable
): Promise<void> {
  const sql = `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [
    entry.actorId ?? null,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
  ];
  if (t) await t.query(sql, params);
  else await query(sql, params);
}
