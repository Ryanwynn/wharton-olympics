"use client";
import { useState } from "react";
import { MascotIcon } from "./MascotIcon";
import type { BracketView, BracketMatchView } from "@/lib/types";

/** Scorekeeper-facing editable bracket: enter per-match scores, mark a match final,
 *  and the winner auto-advances to the next round. */
export function BracketEntry({ eventId, initial }: { eventId: string; initial: BracketView }) {
  const [bracket, setBracket] = useState<BracketView>(initial);
  const [inputs, setInputs] = useState<Record<string, { a: string; b: string }>>(() => seedInputs(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function seedInputsMerge(next: BracketView) {
    setInputs((prev) => {
      const merged = { ...seedInputs(next), ...prev };
      return merged;
    });
  }

  async function refetch() {
    const r = await fetch(`/api/admin/events/${eventId}/bracket`);
    const d = await r.json();
    if (d.bracket) {
      setBracket(d.bracket);
      seedInputsMerge(d.bracket);
    }
  }

  async function patch(matchId: string, status: "live" | "final") {
    setBusy(matchId);
    setError(null);
    const v = inputs[matchId] ?? { a: "", b: "" };
    try {
      const res = await fetch(`/api/admin/events/${eventId}/bracket`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId,
          scoreA: v.a === "" ? null : Number(v.a),
          scoreB: v.b === "" ? null : Number(v.b),
          status,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const setScore = (matchId: string, side: "a" | "b", val: string) =>
    setInputs((prev) => ({ ...prev, [matchId]: { ...(prev[matchId] ?? { a: "", b: "" }), [side]: val.replace(/[^\d]/g, "") } }));

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-penn-red/5 px-2 py-1 text-sm text-penn-red">{error}</p>}
      {bracket.champion && (
        <p className="rounded-lg bg-penn-blue-tint px-3 py-2 text-sm font-semibold text-penn-blue">🏆 Champion: {bracket.champion.label}</p>
      )}
      {bracket.rounds.map((round, i) => (
        <div key={i}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Round {i + 1}</h3>
          <div className="space-y-2">
            {round.map((m) => (
              <MatchRow key={m.id} m={m} inputs={inputs[m.id]} busy={busy === m.id} onScore={setScore} onSave={patch} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchRow({
  m,
  inputs,
  busy,
  onScore,
  onSave,
}: {
  m: BracketMatchView;
  inputs?: { a: string; b: string };
  busy: boolean;
  onScore: (matchId: string, side: "a" | "b", val: string) => void;
  onSave: (matchId: string, status: "live" | "final") => void;
}) {
  const ready = m.a && m.b;
  const v = inputs ?? { a: "", b: "" };
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <SideLabel m={m} side="a" />
        <input
          inputMode="numeric"
          disabled={!ready}
          value={v.a}
          onChange={(e) => onScore(m.id, "a", e.target.value)}
          className="tabular w-16 rounded-md border border-border px-2 py-2 text-center text-lg disabled:bg-surface-alt"
        />
        <SideLabel m={m} side="b" />
        <input
          inputMode="numeric"
          disabled={!ready}
          value={v.b}
          onChange={(e) => onScore(m.id, "b", e.target.value)}
          className="tabular w-16 rounded-md border border-border px-2 py-2 text-center text-lg disabled:bg-surface-alt"
        />
      </div>
      {ready && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold ${m.status === "final" ? "text-cohort-dragon" : m.status === "live" ? "text-penn-red" : "text-ink-muted"}`}>
            {m.status === "final" ? "Final" : m.status === "live" ? "Live" : "Not started"}
          </span>
          <div className="flex gap-2">
            <button onClick={() => onSave(m.id, "live")} disabled={busy} className="rounded border border-border px-2.5 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
              Save
            </button>
            <button onClick={() => onSave(m.id, "final")} disabled={busy} className="rounded bg-penn-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-50">
              Mark final
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SideLabel({ m, side }: { m: BracketMatchView; side: "a" | "b" }) {
  const entrant = side === "a" ? m.a : m.b;
  const isWinner = m.winner != null && m.winner === entrant?.registrationId;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {entrant?.cohortIcon && <MascotIcon icon={entrant.cohortIcon} size={16} color="var(--penn-blue)" />}
      <span className={`truncate text-sm ${isWinner ? "font-bold text-penn-blue" : entrant ? "text-ink" : "text-ink-muted"}`}>
        {entrant ? entrant.label : "TBD"}
      </span>
    </span>
  );
}

function seedInputs(b: BracketView): Record<string, { a: string; b: string }> {
  const out: Record<string, { a: string; b: string }> = {};
  for (const round of b.rounds) {
    for (const m of round) {
      out[m.id] = { a: m.scoreA == null ? "" : String(m.scoreA), b: m.scoreB == null ? "" : String(m.scoreB) };
    }
  }
  return out;
}
