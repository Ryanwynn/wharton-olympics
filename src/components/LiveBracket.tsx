"use client";
import Link from "next/link";
import { useLivePoll } from "./useLivePoll";
import { BracketBoard } from "./BracketBoard";
import type { BracketView } from "@/lib/types";

async function fetchBracket(eventId: string, signal: AbortSignal): Promise<BracketView> {
  const r = await fetch(`/api/events/${eventId}/bracket`, { signal });
  if (!r.ok) throw new Error("bracket fetch failed");
  const d = await r.json();
  return d.bracket as BracketView;
}

export function LiveBracket({ eventId, initial }: { eventId: string; initial: BracketView }) {
  const { data, isPolling } = useLivePoll<BracketView>((s) => fetchBracket(eventId, s), initial, {
    intervalMs: 15_000,
    jitterMs: 3_000,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-penn-blue">
            ← Scoreboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{data.eventName}</h1>
          <p className="text-sm text-ink-muted">Tournament bracket</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={`h-2 w-2 rounded-full ${isPolling ? "bg-cohort-dragon" : "bg-ink-muted"}`} aria-hidden />
          Live
        </span>
      </div>
      <BracketBoard bracket={data} />
    </div>
  );
}
