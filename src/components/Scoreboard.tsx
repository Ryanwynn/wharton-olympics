"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MascotIcon } from "./MascotIcon";
import { useLivePoll } from "./useLivePoll";
import { fmtTime } from "@/lib/time";
import { statusLabel } from "@/lib/format";
import type { StandingRow, ScheduleEvent, EventResultRow } from "@/lib/types";

interface LiveData {
  standings: StandingRow[];
  schedule: ScheduleEvent[];
  lastUpdated: string;
}

const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" });

async function fetchLive(signal: AbortSignal): Promise<LiveData> {
  const [s, sc] = await Promise.all([
    fetch("/api/standings", { signal }).then((r) => r.json()),
    fetch("/api/schedule", { signal }).then((r) => r.json()),
  ]);
  const lastUpdated = [s.lastUpdated, sc.lastUpdated].sort().at(-1) as string;
  return { standings: s.standings, schedule: sc.events, lastUpdated };
}

function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function Scoreboard({ initial }: { initial: LiveData }) {
  const { data, isPolling, lastFetchAt, failed } = useLivePoll<LiveData>(fetchLive, initial, {
    intervalMs: 15_000,
    jitterMs: 3_000,
  });
  const { standings, schedule, lastUpdated } = data;

  // ── movement + pulse since last update ──────────────────────────────────────
  const prevPoints = useRef<Map<string, number>>(new Map(initial.standings.map((r) => [r.cohortId, r.points])));
  const prevRanks = useRef<Map<string, number>>(new Map(initial.standings.map((r) => [r.cohortId, r.rank])));
  const [movement, setMovement] = useState<Map<string, number>>(new Map());
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const changed = new Set<string>();
    const nextMove = new Map<string, number>();
    for (const row of standings) {
      const pp = prevPoints.current.get(row.cohortId);
      if (pp !== undefined && pp !== row.points) changed.add(row.cohortId);
      const pr = prevRanks.current.get(row.cohortId);
      if (pr !== undefined) nextMove.set(row.cohortId, pr - row.rank); // + = moved up
    }
    if (changed.size > 0) {
      setPulse(changed);
      setMovement(nextMove);
      const leader = standings[0];
      setAnnounce(`Standings updated. ${leader.name} leading with ${fmtPoints(leader.points)} points.`);
      const t = setTimeout(() => setPulse(new Set()), 1800);
      prevPoints.current = new Map(standings.map((r) => [r.cohortId, r.points]));
      prevRanks.current = new Map(standings.map((r) => [r.cohortId, r.rank]));
      return () => clearTimeout(t);
    }
    prevPoints.current = new Map(standings.map((r) => [r.cohortId, r.points]));
    prevRanks.current = new Map(standings.map((r) => [r.cohortId, r.rank]));
  }, [standings]);

  const liveEvents = schedule.filter((e) => e.status === "in_progress");

  return (
    <div className="space-y-8">
      {/* Visually-hidden live region so screen readers hear updates (§6.1, §12.4). */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      <section aria-labelledby="standings-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 id="standings-heading" className="text-2xl font-bold sm:text-3xl">
              Cluster standings
            </h1>
            <p className="text-sm text-ink-muted">Overall points across all completed events.</p>
          </div>
          <Freshness lastUpdated={lastUpdated} lastFetchAt={lastFetchAt} isPolling={isPolling} failed={failed} />
        </div>
        <StandingsTable standings={standings} movement={movement} pulse={pulse} />
      </section>

      {liveEvents.length > 0 && <HappeningNow events={liveEvents} />}

      <ScheduleSection events={schedule} />
    </div>
  );
}

// ── Standings table (the signature element, §12.4) ─────────────────────────────
function StandingsTable({
  standings,
  movement,
  pulse,
}: {
  standings: StandingRow[];
  movement: Map<string, number>;
  pulse: Set<string>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Overall cluster standings, ranked by total points.</caption>
        <thead>
          <tr className="border-b border-border bg-surface-alt text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="w-14 px-3 py-2 text-center font-semibold">
              Rank
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              Cluster
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Points
            </th>
            <th scope="col" className="w-16 px-3 py-2 text-center font-semibold">
              <span className="sr-only">Movement since last update</span>
              <span aria-hidden>Move</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const leader = row.rank === 1;
            const move = movement.get(row.cohortId) ?? 0;
            return (
              <tr
                key={row.cohortId}
                className={`border-b border-border last:border-0 ${pulse.has(row.cohortId) ? "animate-row-pulse" : ""} ${
                  leader ? "bg-penn-blue-tint/60" : ""
                }`}
                style={{ boxShadow: `inset 4px 0 0 ${row.colorHex}` }}
              >
                <td className="px-3 py-4 text-center">
                  <span
                    className={`tabular inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      leader ? "bg-penn-blue text-white" : "bg-surface-alt text-ink"
                    }`}
                  >
                    {row.rank}
                  </span>
                </td>
                <th scope="row" className="px-2 py-4 font-normal">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${row.colorHex}1a` }}
                    >
                      <MascotIcon icon={row.iconKey} size={30} color={row.colorHex} title={`${row.name} cluster`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-lg font-semibold text-penn-blue">{row.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {row.eventsScored} {row.eventsScored === 1 ? "event" : "events"} scored
                        {leader && <span className="ml-2 rounded bg-penn-blue px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Leading</span>}
                      </span>
                    </span>
                  </div>
                </th>
                <td className="px-3 py-4 text-right">
                  <span className="tabular text-2xl font-bold text-ink">{fmtPoints(row.points)}</span>
                </td>
                <td className="px-3 py-4 text-center">
                  <Movement delta={move} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Movement({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-ink-muted" title="No change since last update" aria-label="No change">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`tabular inline-flex items-center gap-0.5 text-sm font-semibold ${up ? "text-cohort-dragon" : "text-penn-red"}`}
      aria-label={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(delta)}
    </span>
  );
}

// ── Happening now (§6.1) ───────────────────────────────────────────────────────
function HappeningNow({ events }: { events: ScheduleEvent[] }) {
  return (
    <section aria-labelledby="now-heading">
      <h2 id="now-heading" className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <LiveDot />
        Happening now
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/events#${e.slug}`}
            className="min-w-[220px] shrink-0 rounded-lg border border-border bg-surface p-3 no-underline shadow-sm"
          >
            <div className="font-serif text-base font-semibold text-penn-blue">{e.name}</div>
            <div className="mt-1 text-sm text-ink-muted">{e.location ?? "Location TBD"}</div>
            {e.liveScore && <div className="tabular mt-1.5 text-base font-bold text-ink">{e.liveScore}</div>}
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-penn-red">In progress</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full rounded-full bg-penn-red opacity-75 animate-live-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-penn-red" />
    </span>
  );
}

// ── Schedule (§6.1) ────────────────────────────────────────────────────────────
function ScheduleSection({ events }: { events: ScheduleEvent[] }) {
  const [type, setType] = useState<"all" | "individual" | "team">("all");
  const [location, setLocation] = useState<string>("all");

  const locations = useMemo(
    () => Array.from(new Set(events.map((e) => e.location).filter(Boolean))) as string[],
    [events]
  );

  const filtered = events.filter(
    (e) => (type === "all" || e.entryType === type) && (location === "all" || e.location === location)
  );

  // Group by ET hour block, preserving the (already time-sorted) order.
  const groups: { label: string; items: ScheduleEvent[] }[] = [];
  for (const e of filtered) {
    const label = e.startsAt ? hourFmt.format(new Date(e.startsAt)) : "Time TBD";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <section aria-labelledby="schedule-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="schedule-heading" className="text-xl font-bold">
          Today&rsquo;s schedule
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by entry type" className="inline-flex rounded-md border border-border bg-surface p-0.5">
            {(["all", "individual", "team"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={`rounded px-3 py-1.5 text-sm capitalize ${
                  type === t ? "bg-penn-blue font-semibold text-white" : "text-ink hover:bg-surface-alt"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="loc-filter">
            Filter by location
          </label>
          <select
            id="loc-filter"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          >
            <option value="all">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt p-6 text-center text-ink-muted">
          No events match this filter.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.label}</h3>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                {g.items.map((e) => (
                  <ScheduleRow key={e.id} event={e} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleRow({ event }: { event: ScheduleEvent }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<EventResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const expandable = event.status === "complete" || event.status === "in_progress";

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && results === null && expandable) {
      setLoading(true);
      try {
        const r = await fetch(`/api/events/${event.slug}`).then((res) => res.json());
        setResults(r.event?.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }
  }, [open, results, expandable, event.slug]);

  return (
    <li id={event.slug} className="border-b border-border last:border-0">
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
        <div className="tabular w-14 shrink-0 pt-0.5 text-sm font-semibold text-ink sm:w-16">{fmtTime(event.startsAt)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{event.name}</span>
            <TypeBadge type={event.entryType} />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">{event.location ?? "Location TBD"}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={event.status} />
          {event.hasBracket && (
            <Link href={`/bracket/${event.id}`} className="rounded-md px-2 py-1 text-sm font-medium text-penn-blue hover:underline">
              Bracket ↗
            </Link>
          )}
          {expandable && (
            <button
              onClick={toggle}
              aria-expanded={open}
              aria-controls={`res-${event.slug}`}
              className="rounded-md px-2 py-1 text-sm font-medium text-penn-blue hover:bg-surface-alt hover:underline"
            >
              {open ? "Hide" : "Results"}
              <span className="sr-only"> for {event.name}</span>
            </button>
          )}
        </div>
      </div>
      {open && expandable && (
        <div id={`res-${event.slug}`} className="border-t border-border bg-surface-alt px-3 py-3 sm:px-4">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading results…</p>
          ) : results && results.length > 0 ? (
            <ol className="space-y-1">
              {results.slice(0, 8).map((r, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="tabular w-6 text-right font-semibold text-ink-muted">{r.placement ?? "–"}</span>
                  {r.cohortIcon && <MascotIcon icon={r.cohortIcon} size={18} color="var(--penn-blue)" />}
                  <span className="flex-1 truncate text-ink">{r.entrantLabel}</span>
                  <span className="text-xs text-ink-muted">{r.cohortName}</span>
                  <span className="tabular w-14 text-right font-semibold text-ink">{fmtPoints(r.points)} pt</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">
              {event.status === "in_progress" ? "No results posted yet — event in progress." : "No results recorded."}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function TypeBadge({ type }: { type: "individual" | "team" }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        type === "team" ? "bg-penn-blue-tint text-penn-blue" : "bg-surface-alt text-ink-muted"
      }`}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  if (label === "in progress") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-penn-red/10 px-2 py-1 text-xs font-semibold text-penn-red">
        <LiveDot />
        Live
      </span>
    );
  }
  if (label === "final") {
    return (
      <span className="shrink-0 rounded-full bg-penn-blue-tint px-2 py-1 text-xs font-semibold text-penn-blue">Final</span>
    );
  }
  if (label === "cancelled") {
    return <span className="shrink-0 rounded-full bg-surface-alt px-2 py-1 text-xs font-semibold text-ink-muted line-through">Cancelled</span>;
  }
  return <span className="shrink-0 rounded-full bg-surface-alt px-2 py-1 text-xs font-medium text-ink-muted">Upcoming</span>;
}

// ── Freshness pill (§6.1: last-updated always visible) ─────────────────────────
function Freshness({
  lastUpdated,
  lastFetchAt,
  isPolling,
  failed,
}: {
  lastUpdated: string;
  lastFetchAt: number;
  isPolling: boolean;
  failed: boolean;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastFetchAt) / 1000));

  return (
    <div className="shrink-0 text-right text-xs text-ink-muted">
      <div className="flex items-center justify-end gap-1.5">
        {failed ? (
          <span className="text-penn-red">Reconnecting…</span>
        ) : (
          <>
            <span className={`h-2 w-2 rounded-full ${isPolling ? "bg-cohort-dragon" : "bg-ink-muted"}`} aria-hidden />
            <span suppressHydrationWarning>{isPolling ? `Live · updated ${secondsAgo}s ago` : "Paused"}</span>
          </>
        )}
      </div>
      <div suppressHydrationWarning className="mt-0.5">
        Results as of {fmtTime(lastUpdated)}
      </div>
    </div>
  );
}
