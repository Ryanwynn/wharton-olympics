"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MascotIcon } from "./MascotIcon";
import { BracketEntry } from "./BracketEntry";
import type { ScoringEvent, ScoreEntrant } from "@/lib/adminQueries";
import type { BracketView } from "@/lib/types";

type Sync = "saved" | "pending" | "saving" | "failed";

interface RowState extends ScoreEntrant {
  sync: Sync;
}

/**
 * Scorekeeper entry (§6.5). Deliberately chrome-free, large tap targets, one job.
 * Tolerates a bad connection: edits write to local state immediately, are queued,
 * and retried with exponential backoff. The queue is persisted to localStorage so a
 * reload or crash never loses a write. Each row shows pending / saving / saved /
 * failed. Nothing is ever silently dropped.
 */
export function ScoreEntry({ initial, initialBracket }: { initial: ScoringEvent; initialBracket?: BracketView | null }) {
  const eventId = initial.id;
  const storeKey = `wso-score-queue-${eventId}`;
  const [bracket, setBracket] = useState<BracketView | null>(initialBracket ?? null);
  const [bracketBusy, setBracketBusy] = useState(false);

  async function makeBracket() {
    if (bracket && !confirm("Regenerate the bracket? This clears all current match results.")) return;
    setBracketBusy(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/bracket`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not create the bracket.");
      }
      const r = await fetch(`/api/admin/events/${eventId}/bracket`);
      const d = await r.json();
      setBracket(d.bracket);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBracketBusy(false);
    }
  }

  const [rows, setRows] = useState<RowState[]>(() =>
    initial.entrants.map((e) => ({ ...e, sync: e.points == null && e.placement == null ? "saved" : "saved" }))
  );
  const [online, setOnline] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(initial.status === "complete");
  const [banner, setBanner] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState(initial.liveScore ?? "");
  const [liveState, setLiveState] = useState<"idle" | "saving" | "saved">("saved");
  const liveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveLive = (val: string) => {
    setLiveScore(val);
    setLiveState("saving");
    if (liveDebounce.current) clearTimeout(liveDebounce.current);
    liveDebounce.current = setTimeout(async () => {
      try {
        await fetch(`/api/admin/events/${eventId}/live`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ live_score: val }),
        });
        setLiveState("saved");
      } catch {
        setLiveState("idle");
      }
    }, 700);
  };

  // Queue of registrationIds with unsaved values, plus retry bookkeeping.
  const queue = useRef<Map<string, { points: number; placement: number | null }>>(new Map());
  const attempt = useRef(0);
  const flushing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    try {
      const values: Record<string, { points: number; placement: number | null }> = {};
      queue.current.forEach((v, k) => (values[k] = v));
      localStorage.setItem(storeKey, JSON.stringify(values));
    } catch {
      /* storage may be unavailable; the in-memory queue still retries */
    }
  }, [storeKey]);

  const setSync = (regId: string, sync: Sync) =>
    setRows((prev) => prev.map((r) => (r.registrationId === regId ? { ...r, sync } : r)));

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (queue.current.size === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return; // wait for reconnect
    flushing.current = true;

    const batch = Array.from(queue.current.entries()).map(([registrationId, v]) => ({
      registrationId,
      points: v.points,
      placement: v.placement,
    }));
    batch.forEach((b) => setSync(b.registrationId, "saving"));

    try {
      const res = await fetch(`/api/admin/events/${eventId}/scores`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores: batch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Success — clear the saved rows from the queue (only if unchanged since send).
      for (const b of batch) {
        const cur = queue.current.get(b.registrationId);
        if (cur && cur.points === b.points && cur.placement === b.placement) {
          queue.current.delete(b.registrationId);
          setSync(b.registrationId, "saved");
        }
      }
      attempt.current = 0;
      persist();
    } catch {
      batch.forEach((b) => setSync(b.registrationId, "failed"));
      attempt.current = Math.min(attempt.current + 1, 6);
      const delay = Math.min(1000 * 2 ** attempt.current, 30_000); // exp backoff, cap 30s
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => void flush(), delay);
    } finally {
      flushing.current = false;
      // If more edits arrived mid-flight, flush again.
      if (queue.current.size > 0 && navigator.onLine) {
        setTimeout(() => void flush(), 400);
      }
    }
  }, [eventId, persist]);

  // Rehydrate any writes that didn't sync before a reload/crash.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const values = JSON.parse(raw) as Record<string, { points: number; placement: number | null }>;
        const ids = Object.keys(values);
        if (ids.length) {
          ids.forEach((id) => queue.current.set(id, values[id]));
          setRows((prev) =>
            prev.map((r) =>
              values[r.registrationId]
                ? { ...r, points: values[r.registrationId].points, placement: values[r.registrationId].placement, sync: "pending" }
                : r
            )
          );
          setBanner("Recovered unsynced scores from this device — syncing…");
          void flush();
        }
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online/offline handling.
  useEffect(() => {
    const update = () => {
      const on = navigator.onLine;
      setOnline(on);
      if (on) void flush();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [flush]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edit = (regId: string, changes: { points?: number; placement?: number | null }) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.registrationId !== regId) return r;
        const next = { ...r, ...changes };
        // Auto-fill points from the event's schema when a placement is entered,
        // but leave it editable (§4).
        if (changes.placement !== undefined && changes.placement != null && initial.pointsSchema) {
          const fromSchema = initial.pointsSchema[String(changes.placement)] ?? initial.pointsSchema["participation"];
          if (fromSchema != null && (changes.points === undefined)) next.points = fromSchema;
        }
        return { ...next, sync: "pending" };
      })
    );
    // Enqueue latest value after state settles.
    setTimeout(() => {
      setRows((cur) => {
        const row = cur.find((r) => r.registrationId === regId);
        if (row) queue.current.set(regId, { points: Number(row.points ?? 0), placement: row.placement ?? null });
        persist();
        return cur;
      });
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void flush(), 600);
    }, 0);
  };

  async function markFinal() {
    if (queue.current.size > 0) {
      setBanner("Save all scores before finalizing.");
      await flush();
      return;
    }
    setFinalizing(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/finalize`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not finalize.");
      }
      setFinalized(true);
      setBanner("Event marked final and published to the scoreboard.");
    } catch (err) {
      setBanner((err as Error).message);
    } finally {
      setFinalizing(false);
    }
  }

  const pendingCount = rows.filter((r) => r.sync === "pending" || r.sync === "saving").length;
  const failedCount = rows.filter((r) => r.sync === "failed").length;

  return (
    <div className="mx-auto max-w-xl px-3 py-4">
      <header className="mb-3">
        <a href="/admin" className="text-sm text-penn-blue">← Admin</a>
        <h1 className="mt-1 font-serif text-2xl font-bold text-penn-blue">{initial.name}</h1>
        <p className="text-sm text-ink-muted">
          Enter a placement — points pre-fill from the schema and stay editable.
        </p>
      </header>

      {!finalized && (
        <div className="mb-3 rounded-lg border border-border bg-surface p-3">
          <label htmlFor="live-score" className="text-xs font-medium text-ink-muted">
            Live score (shown on the public scoreboard while in progress)
          </label>
          <input
            id="live-score"
            value={liveScore}
            onChange={(e) => saveLive(e.target.value)}
            placeholder="e.g. Lions 40 – Tigers 50, Q3"
            className="mt-1 w-full rounded-md border border-border px-3 py-3 text-base outline-none focus:border-penn-blue"
          />
          <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
            {liveState === "saving" ? "Saving…" : liveState === "saved" && liveScore ? "Saved — live on the scoreboard" : ""}
          </p>
        </div>
      )}

      {/* Tournament bracket — build it, run matches, winners advance (§ brackets). */}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Tournament bracket</h2>
          <div className="flex items-center gap-2">
            {bracket && (
              <a href={`/bracket/${eventId}`} target="_blank" rel="noreferrer" className="text-xs text-penn-blue">
                Public view ↗
              </a>
            )}
            {!finalized && (
              <button onClick={makeBracket} disabled={bracketBusy} className="rounded border border-border px-2.5 py-1 text-xs hover:bg-surface-alt disabled:opacity-50">
                {bracketBusy ? "Working…" : bracket ? "Regenerate" : "Create bracket"}
              </button>
            )}
          </div>
        </div>
        {bracket ? (
          <div className="mt-3">
            <BracketEntry eventId={eventId} initial={bracket} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">
            Optional: build a single-elimination bracket from the {initial.entrants.length} registered entrants — winners advance each round.
          </p>
        )}
      </div>

      {bracket && <h2 className="mb-1 text-sm font-semibold text-ink">Final points for standings</h2>}

      <div
        className={`sticky top-0 z-10 mb-3 rounded-md px-3 py-2 text-sm font-medium ${
          !online
            ? "bg-amber-100 text-amber-900"
            : failedCount > 0
            ? "bg-penn-red/10 text-penn-red"
            : pendingCount > 0
            ? "bg-penn-blue-tint text-penn-blue"
            : "bg-cohort-dragon/10 text-cohort-dragon"
        }`}
        aria-live="polite"
      >
        {!online
          ? "Offline — scores are saved on this device and will sync when you reconnect."
          : failedCount > 0
          ? `${failedCount} row(s) failed to save — retrying automatically.`
          : pendingCount > 0
          ? `Saving ${pendingCount} change(s)…`
          : "All scores saved."}
      </div>

      {banner && <p className="mb-3 rounded-md bg-surface-alt px-3 py-2 text-sm text-ink">{banner}</p>}

      <ol className="space-y-2">
        {rows.map((r) => (
          <li key={r.registrationId} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {r.cohortIcon && <MascotIcon icon={r.cohortIcon} size={22} color="var(--penn-blue)" />}
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{r.label}</div>
                  <div className="text-xs text-ink-muted">{r.cohortName ?? "—"}</div>
                </div>
              </div>
              <SyncDot sync={r.sync} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-ink-muted">
                Place
                <input
                  inputMode="numeric"
                  value={r.placement ?? ""}
                  disabled={finalized}
                  onChange={(e) => edit(r.registrationId, { placement: e.target.value === "" ? null : parseInt(e.target.value.replace(/\D/g, ""), 10) })}
                  className="tabular mt-0.5 w-full rounded-md border border-border px-3 py-3 text-lg outline-none focus:border-penn-blue disabled:bg-surface-alt"
                />
              </label>
              <label className="text-xs font-medium text-ink-muted">
                Points
                <input
                  inputMode="decimal"
                  value={r.points ?? ""}
                  disabled={finalized}
                  onChange={(e) => edit(r.registrationId, { points: e.target.value === "" ? 0 : parseFloat(e.target.value.replace(/[^\d.]/g, "")) })}
                  className="tabular mt-0.5 w-full rounded-md border border-border px-3 py-3 text-lg outline-none focus:border-penn-blue disabled:bg-surface-alt"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      {rows.length === 0 && <p className="rounded-lg border border-border bg-surface-alt p-6 text-center text-ink-muted">No registered entrants yet.</p>}

      <div className="sticky bottom-0 mt-4 bg-surface pb-2 pt-2">
        {finalized ? (
          <div className="rounded-md bg-cohort-dragon/10 px-4 py-3 text-center font-semibold text-cohort-dragon">
            Final — results are live on the scoreboard.
          </div>
        ) : (
          <button
            onClick={markFinal}
            disabled={finalizing || rows.length === 0}
            className="w-full rounded-md bg-penn-red px-4 py-4 text-lg font-bold text-white hover:bg-penn-red-hover disabled:opacity-60"
          >
            {finalizing ? "Finalizing…" : "Mark event final & publish"}
          </button>
        )}
      </div>
    </div>
  );
}

function SyncDot({ sync }: { sync: Sync }) {
  const map: Record<Sync, { label: string; cls: string }> = {
    saved: { label: "Saved", cls: "text-cohort-dragon" },
    pending: { label: "Pending", cls: "text-ink-muted" },
    saving: { label: "Saving…", cls: "text-penn-blue" },
    failed: { label: "Retry", cls: "text-penn-red" },
  };
  const { label, cls } = map[sync];
  return (
    <span className={`shrink-0 text-xs font-semibold ${cls}`} aria-live="polite">
      {sync === "saved" ? "✓ " : sync === "failed" ? "⚠ " : ""}
      {label}
    </span>
  );
}
