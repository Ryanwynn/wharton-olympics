"use client";
import { MascotIcon } from "./MascotIcon";
import type { BracketView, BracketMatchView, BracketEntrantLite } from "@/lib/types";

function roundName(idx: number, total: number): string {
  const fromEnd = total - idx;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round of ${2 ** fromEnd}`;
}

export function BracketBoard({ bracket }: { bracket: BracketView }) {
  return (
    <div>
      {bracket.champion && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-penn-blue/20 bg-penn-blue-tint px-4 py-3">
          <span className="text-lg">🏆</span>
          <span className="text-sm text-ink-muted">Champion</span>
          {bracket.champion.cohortIcon && <MascotIcon icon={bracket.champion.cohortIcon} size={22} color="var(--penn-blue)" />}
          <span className="font-serif text-lg font-bold text-penn-blue">{bracket.champion.label}</span>
        </div>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-min gap-6">
          {bracket.rounds.map((round, i) => (
            <div key={i} className="flex min-w-[200px] flex-col justify-around gap-4">
              <h3 className="text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {roundName(i, bracket.rounds.length)}
              </h3>
              {round.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match: m }: { match: BracketMatchView }) {
  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm">
      <Side entrant={m.a} score={m.scoreA} isWinner={m.winner != null && m.winner === m.a?.registrationId} top />
      <div className="border-t border-border" />
      <Side entrant={m.b} score={m.scoreB} isWinner={m.winner != null && m.winner === m.b?.registrationId} />
      {m.status === "live" && (
        <div className="border-t border-border px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-penn-red">
          Live
        </div>
      )}
    </div>
  );
}

function Side({
  entrant,
  score,
  isWinner,
  top,
}: {
  entrant: BracketEntrantLite | null;
  score: number | null;
  isWinner: boolean;
  top?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2.5 py-2 ${top ? "rounded-t-lg" : "rounded-b-lg"} ${isWinner ? "bg-penn-blue-tint" : ""}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        {entrant?.cohortIcon && <MascotIcon icon={entrant.cohortIcon} size={16} color="var(--penn-blue)" />}
        <span className={`truncate text-sm ${isWinner ? "font-semibold text-penn-blue" : entrant ? "text-ink" : "text-ink-muted"}`}>
          {entrant ? entrant.label : "TBD"}
        </span>
      </span>
      <span className={`tabular shrink-0 text-sm ${isWinner ? "font-bold text-penn-blue" : "text-ink-muted"}`}>{score ?? "–"}</span>
    </div>
  );
}
