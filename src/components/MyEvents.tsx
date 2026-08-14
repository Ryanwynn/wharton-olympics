"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDayTime, fmtTime } from "@/lib/time";
import { ConfirmDialog } from "./ConfirmDialog";
import type { AgendaItem } from "@/lib/types";

export function MyEvents({ items }: { items: AgendaItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ key: string; url: string; title: string; message: string; label: string } | null>(null);

  async function act(key: string, url: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">My events</h1>
          <p className="text-sm text-ink-muted">Your personal schedule for the day.</p>
        </div>
        {items.length > 0 && (
          <a
            href="/api/me/calendar.ics"
            className="rounded-md border border-penn-blue px-3 py-2 text-sm font-semibold text-penn-blue no-underline hover:bg-penn-blue-tint"
          >
            Add to calendar (.ics)
          </a>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-penn-red/5 px-3 py-2 text-sm text-penn-red">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-alt p-8 text-center">
          <p className="text-ink-muted">You haven&rsquo;t registered for anything yet.</p>
          <Link href="/events" className="mt-2 inline-block font-semibold text-penn-blue">
            Browse events →
          </Link>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((it) => (
            <li key={`${it.eventId}-${it.team?.id ?? "i"}`} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="tabular text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {fmtDayTime(it.startsAt)}
                    {it.endsAt ? `–${fmtTime(it.endsAt)}` : ""}
                  </div>
                  <h2 className="mt-0.5 font-serif text-lg font-semibold text-penn-blue">
                    <Link href={`/events`} className="no-underline hover:underline">
                      {it.eventName}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {it.location ?? "Location TBD"}
                    {it.locationNote ? ` · ${it.locationNote}` : ""}
                  </p>
                </div>
                <StatusPill item={it} />
              </div>

              {it.team && (
                <div className="mt-3 rounded-lg border border-border bg-surface-alt p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{it.team.name}</span>
                    {it.team.isCaptain && it.team.inviteCode && (
                      <span className="text-xs text-ink-muted">
                        code{" "}
                        <span className="tabular font-mono font-bold tracking-widest text-ink">{it.team.inviteCode}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {it.team.members.map((m) => m.name).join(", ")}
                  </p>
                </div>
              )}

              <div className="mt-3 flex justify-end">
                {it.team ? (
                  <button
                    onClick={() =>
                      setConfirmState({
                        key: it.eventId,
                        url: `/api/teams/${it.team!.id}/leave`,
                        title: `Leave ${it.team!.name}?`,
                        message: it.team!.isCaptain
                          ? "You're the captain — leaving reassigns the captaincy to another member (or disbands the team if you're the last one)."
                          : "You'll be removed from this team.",
                        label: "Leave team",
                      })
                    }
                    disabled={busy === it.eventId}
                    className="rounded-md px-3 py-2 text-sm text-penn-red hover:bg-penn-red/5 disabled:opacity-50"
                  >
                    {busy === it.eventId ? "…" : "Leave team"}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      setConfirmState({
                        key: it.eventId,
                        url: `/api/events/${it.eventId}/withdraw`,
                        title: it.registrationStatus === "waitlisted" ? "Leave the waitlist?" : `Withdraw from ${it.eventName}?`,
                        message:
                          it.registrationStatus === "waitlisted"
                            ? "You'll lose your place in line for this event."
                            : "This frees your spot. If there's a waitlist, the next person is moved up automatically.",
                        label: it.registrationStatus === "waitlisted" ? "Leave waitlist" : "Withdraw",
                      })
                    }
                    disabled={busy === it.eventId}
                    className="rounded-md px-3 py-2 text-sm text-penn-red hover:bg-penn-red/5 disabled:opacity-50"
                  >
                    {busy === it.eventId ? "…" : it.registrationStatus === "waitlisted" ? "Leave waitlist" : "Withdraw"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.label ?? "Confirm"}
        onConfirm={() => {
          if (confirmState) act(confirmState.key, confirmState.url);
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function StatusPill({ item }: { item: AgendaItem }) {
  if (item.team?.status === "forming") {
    return <span className="shrink-0 rounded-full bg-surface-alt px-2 py-1 text-xs font-semibold text-ink-muted">Forming</span>;
  }
  if (item.registrationStatus === "waitlisted") {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        Waitlist{item.waitlistPos ? ` #${item.waitlistPos}` : ""}
      </span>
    );
  }
  return <span className="shrink-0 rounded-full bg-penn-blue-tint px-2 py-1 text-xs font-semibold text-penn-blue">Registered</span>;
}
