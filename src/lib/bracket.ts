import { query, queryOne, tx, type Queryable } from "./db";
import { publicName } from "./format";
import type { BracketView, BracketMatchView, BracketEntrantLite, IconKey } from "./types";

/**
 * Single-elimination tournament brackets. Entrants are the event's registered
 * registrations (works for individual or team events). Winners auto-advance into
 * the next round's match. Seeding is registration order; the field is padded to a
 * power of two with byes given to the earliest entrants.
 */

export class BracketError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function advanceWinner(t: Queryable, matchId: string, winner: string) {
  const m = (
    await t.query<{ next_match_id: string | null; next_slot: string | null }>(
      `SELECT next_match_id, next_slot FROM bracket_matches WHERE id = $1`,
      [matchId]
    )
  ).rows[0];
  if (!m || !m.next_match_id) return; // this was the final
  const col = m.next_slot === "a" ? "entrant_a" : "entrant_b";
  await t.query(`UPDATE bracket_matches SET ${col} = $1 WHERE id = $2`, [winner, m.next_match_id]);
}

export async function generateBracket(eventId: string): Promise<{ rounds: number; matches: number }> {
  return tx(async (t) => {
    const ev = (await t.query<{ id: string }>(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [eventId])).rows[0];
    if (!ev) throw new BracketError(404, "Event not found.");

    const entrants = (
      await t.query<{ id: string }>(
        `SELECT id FROM registrations WHERE event_id = $1 AND status = 'registered' ORDER BY created_at ASC`,
        [eventId]
      )
    ).rows.map((r) => r.id);
    if (entrants.length < 2) throw new BracketError(400, "Need at least 2 registered entrants to build a bracket.");

    await t.query(`DELETE FROM bracket_matches WHERE event_id = $1`, [eventId]);

    let size = 1;
    while (size < entrants.length) size *= 2;
    const rounds = Math.log2(size);

    // Create empty matches for every round.
    const matrix: string[][] = [];
    for (let r = 1; r <= rounds; r++) {
      const count = size / 2 ** r;
      const row: string[] = [];
      for (let s = 0; s < count; s++) {
        const m = (
          await t.query<{ id: string }>(`INSERT INTO bracket_matches (event_id, round, slot) VALUES ($1, $2, $3) RETURNING id`, [eventId, r, s])
        ).rows[0];
        row.push(m.id);
      }
      matrix.push(row);
    }

    // Link each match to the next round's match its winner advances into.
    for (let r = 0; r < rounds - 1; r++) {
      for (let s = 0; s < matrix[r].length; s++) {
        const nextId = matrix[r + 1][Math.floor(s / 2)];
        const nextSlot = s % 2 === 0 ? "a" : "b";
        await t.query(`UPDATE bracket_matches SET next_match_id = $1, next_slot = $2 WHERE id = $3`, [nextId, nextSlot, matrix[r][s]]);
      }
    }

    // Seed round 1; a match with only one entrant is a bye that auto-advances.
    const slots: (string | null)[] = [...entrants];
    while (slots.length < size) slots.push(null);
    for (let s = 0; s < size / 2; s++) {
      const a = slots[2 * s];
      const b = slots[2 * s + 1];
      const mId = matrix[0][s];
      await t.query(`UPDATE bracket_matches SET entrant_a = $1, entrant_b = $2 WHERE id = $3`, [a, b, mId]);
      if (a && !b) {
        await t.query(`UPDATE bracket_matches SET winner = $1, status = 'final' WHERE id = $2`, [a, mId]);
        await advanceWinner(t, mId, a);
      }
    }

    await t.query(`UPDATE events SET has_bracket = true, updated_at = now() WHERE id = $1`, [eventId]);
    return { rounds, matches: size - 1 };
  });
}

export async function recordMatch(
  eventId: string,
  matchId: string,
  input: { scoreA?: number | null; scoreB?: number | null; winner?: string | null; status?: string }
) {
  return tx(async (t) => {
    const m = (await t.query<any>(`SELECT * FROM bracket_matches WHERE id = $1 AND event_id = $2`, [matchId, eventId])).rows[0];
    if (!m) throw new BracketError(404, "Match not found.");

    const scoreA = input.scoreA === undefined ? m.score_a : input.scoreA;
    const scoreB = input.scoreB === undefined ? m.score_b : input.scoreB;
    const status = input.status ?? (scoreA != null && scoreB != null ? "live" : m.status);
    let winner = input.winner === undefined ? m.winner : input.winner;

    // Infer the winner from the score when finalizing without an explicit pick.
    if (status === "final" && !winner && scoreA != null && scoreB != null && scoreA !== scoreB) {
      winner = scoreA > scoreB ? m.entrant_a : m.entrant_b;
    }
    if (status === "final" && !winner) throw new BracketError(400, "A final match needs a winner (scores are tied).");

    await t.query(`UPDATE bracket_matches SET score_a = $1, score_b = $2, winner = $3, status = $4 WHERE id = $5`, [
      scoreA,
      scoreB,
      winner,
      status,
      matchId,
    ]);
    if (status === "final" && winner) await advanceWinner(t, matchId, winner);
    return { ok: true, winner, status };
  });
}

/** Label map for every entrant registration in an event. */
async function entrantLabels(eventId: string, publicView: boolean): Promise<Map<string, BracketEntrantLite>> {
  const rows = await query<any>(
    `SELECT r.id, u.display_name AS user_name, t.name AS team_name, c.icon_key AS cohort_icon
       FROM registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users cap ON cap.id = t.captain_id
       LEFT JOIN cohorts c ON c.id = COALESCE(u.cohort_id, cap.cohort_id)
      WHERE r.event_id = $1`,
    [eventId]
  );
  const map = new Map<string, BracketEntrantLite>();
  for (const r of rows) {
    const label = r.team_name ? r.team_name : r.user_name ? (publicView ? publicName(r.user_name) : r.user_name) : "—";
    map.set(r.id, { registrationId: r.id, label, cohortIcon: (r.cohort_icon as IconKey) ?? null });
  }
  return map;
}

export async function getBracket(eventId: string, publicView = false): Promise<BracketView | null> {
  const ev = await queryOne<any>(`SELECT id, name, slug FROM events WHERE id = $1`, [eventId]);
  if (!ev) return null;
  const matches = await query<any>(`SELECT * FROM bracket_matches WHERE event_id = $1 ORDER BY round ASC, slot ASC`, [eventId]);
  if (matches.length === 0) return null;

  const labels = await entrantLabels(eventId, publicView);
  const ent = (id: string | null): BracketEntrantLite | null => (id ? labels.get(id) ?? { registrationId: id, label: "—", cohortIcon: null } : null);

  const maxRound = Math.max(...matches.map((m) => m.round));
  const rounds: BracketMatchView[][] = Array.from({ length: maxRound }, () => []);
  for (const m of matches) {
    rounds[m.round - 1].push({
      id: m.id,
      round: m.round,
      slot: m.slot,
      a: ent(m.entrant_a),
      b: ent(m.entrant_b),
      scoreA: m.score_a,
      scoreB: m.score_b,
      winner: m.winner,
      status: m.status,
    });
  }

  const finalMatch = matches.find((m) => m.round === maxRound);
  const champion = finalMatch && finalMatch.status === "final" && finalMatch.winner ? ent(finalMatch.winner) : null;

  return { eventId: ev.id, eventName: ev.name, slug: ev.slug, rounds, champion };
}
