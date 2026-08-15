"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtTime, fmtDayTime, fmtOpensLabel } from "@/lib/time";
import { ConfirmDialog } from "./ConfirmDialog";
import type { BrowseEvent } from "@/lib/types";

export function EventsBrowser({
  initialEvents,
  signedIn,
}: {
  initialEvents: BrowseEvent[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [filter, setFilter] = useState<"all" | "individual" | "team" | "mine">("all");

  // Resync from the server after router.refresh().
  useEffect(() => setEvents(initialEvents), [initialEvents]);

  const patch = (id: string, changes: Partial<BrowseEvent>) =>
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));

  const shown = events.filter((e) => {
    if (filter === "individual") return e.entryType === "individual";
    if (filter === "team") return e.entryType === "team";
    if (filter === "mine") return e.viewer?.registrationStatus !== "none" || e.viewer?.team;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Events</h1>
          <p className="text-sm text-ink-muted">Register, form a team, and see what&rsquo;s filling up.</p>
        </div>
        <div role="group" aria-label="Filter events" className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm">
          {(["all", "individual", "team", ...(signedIn ? (["mine"] as const) : [])] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded px-3 py-1.5 capitalize ${filter === f ? "bg-penn-blue font-semibold text-white" : "text-ink hover:bg-surface-alt"}`}
            >
              {f === "mine" ? "My events" : f}
            </button>
          ))}
        </div>
      </div>

      {!signedIn && (
        <div className="rounded-lg border border-penn-blue/20 bg-penn-blue-tint px-4 py-3 text-sm text-penn-blue">
          <Link href="/signin?next=/events" className="font-semibold underline">
            Sign in
          </Link>{" "}
          with your Penn email to register. Browsing is open to everyone.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((e) => (
          <EventCard key={e.id} event={e} signedIn={signedIn} patch={patch} refresh={() => router.refresh()} />
        ))}
      </div>
    </div>
  );
}

function actionState(e: BrowseEvent) {
  const now = Date.now();
  const opensAt = e.signupOpensAt ? Date.parse(e.signupOpensAt) : null;
  const closesAt = e.signupClosesAt ? Date.parse(e.signupClosesAt) : null;
  const published = e.status === "published";
  const notYetOpen = published && opensAt != null && opensAt > now;
  const open = published && (opensAt == null || opensAt <= now) && (closesAt == null || closesAt >= now);
  const closed = !published || (closesAt != null && closesAt < now);
  const full = e.capacity != null && e.registeredCount >= e.capacity;
  return { notYetOpen, open, closed, full };
}

function EventCard({
  event: e,
  signedIn,
  patch,
  refresh,
}: {
  event: BrowseEvent;
  signedIn: boolean;
  patch: (id: string, changes: Partial<BrowseEvent>) => void;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const st = actionState(e);
  const viewer = e.viewer;

  async function call(url: string, opts: RequestInit = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      refresh();
      return data;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const register = () =>
    call(`/api/events/${e.id}/register`, {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
    }).catch(() => {});
  const doWithdraw = () => call(`/api/events/${e.id}/withdraw`, { method: "POST" }).catch(() => {});
  const requestWithdraw = (isWaitlist: boolean) =>
    setConfirmState({
      title: isWaitlist ? "Leave the waitlist?" : `Withdraw from ${e.name}?`,
      message: isWaitlist
        ? "You'll lose your place in line for this event."
        : "This frees your spot. If there's a waitlist, the next person is moved up automatically.",
      label: isWaitlist ? "Leave waitlist" : "Withdraw",
      run: doWithdraw,
    });
  const requestLeaveTeam = (teamId: string, teamName: string, isCaptain: boolean) =>
    setConfirmState({
      title: `Leave ${teamName}?`,
      message: isCaptain
        ? "You're the captain — leaving reassigns the captaincy to another member (or disbands the team if you're the last one)."
        : "You'll be removed from this team.",
      label: "Leave team",
      run: () => call(`/api/teams/${teamId}/leave`, { method: "POST" }).catch(() => {}),
    });

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-penn-blue">{e.name}</h2>
          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${e.entryType === "team" ? "bg-penn-blue-tint text-penn-blue" : "bg-surface-alt text-ink-muted"}`}>
            {e.entryType}
          </span>
        </div>
        <SpotsBadge event={e} />
      </div>

      {e.description && <p className="mt-2 text-sm text-ink-muted">{e.description}</p>}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-muted">When</dt>
          <dd className="text-ink">{fmtDayTime(e.startsAt)}{e.endsAt ? `–${fmtTime(e.endsAt)}` : ""}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-muted">Where</dt>
          <dd className="text-ink">{e.location ?? "TBD"}{e.locationNote ? ` · ${e.locationNote}` : ""}</dd>
        </div>
        {e.entryType === "team" && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-muted">Team</dt>
            <dd className="text-ink">{e.minTeamSize}–{e.maxTeamSize} players</dd>
          </div>
        )}
      </dl>

      {e.hasBracket && (
        <Link href={`/bracket/${e.id}`} className="mt-2 inline-block text-sm font-medium text-penn-blue hover:underline">
          View tournament bracket →
        </Link>
      )}

      {/* Conflict warning — flagged, never blocked (§6.2, §6.4). */}
      {e.conflictsWith && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ Overlaps <span className="font-semibold">{e.conflictsWith.name}</span>
          {e.conflictsWith.startsAt ? ` at ${fmtTime(e.conflictsWith.startsAt)}` : ""}. You can still register.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-penn-red/5 px-3 py-2 text-xs text-penn-red">
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        {!signedIn ? (
          <Link
            href="/signin?next=/events"
            className="block rounded-md bg-penn-blue px-4 py-2.5 text-center font-semibold text-white no-underline hover:bg-penn-blue-hover"
          >
            Sign in to register
          </Link>
        ) : e.entryType === "team" ? (
          <TeamArea event={e} busy={busy} call={call} state={st} onLeave={requestLeaveTeam} />
        ) : (
          <IndividualArea event={e} busy={busy} state={st} onRegister={register} onWithdraw={requestWithdraw} viewer={viewer} />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.label ?? "Confirm"}
        onConfirm={() => {
          confirmState?.run();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function SpotsBadge({ event: e }: { event: BrowseEvent }) {
  if (e.capacity == null) return <span className="text-xs text-ink-muted">No cap</span>;
  const left = e.spotsRemaining ?? 0;
  const color = left === 0 ? "text-penn-red" : left <= 5 ? "text-amber-700" : "text-ink-muted";
  return (
    <span className={`tabular shrink-0 text-right text-xs ${color}`}>
      <span className="block text-sm font-bold">{left}</span>
      {e.entryType === "team" ? "team slots" : "spots"} left
    </span>
  );
}

function IndividualArea({
  event: e,
  busy,
  state,
  onRegister,
  onWithdraw,
  viewer,
}: {
  event: BrowseEvent;
  busy: boolean;
  state: ReturnType<typeof actionState>;
  onRegister: () => void;
  onWithdraw: (isWaitlist: boolean) => void;
  viewer: BrowseEvent["viewer"];
}) {
  if (viewer?.registrationStatus === "registered") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-cohort-dragon">Registered ✓</span>
        <button onClick={() => onWithdraw(false)} disabled={busy} className="rounded-md px-3 py-2 text-sm text-penn-red hover:bg-penn-red/5 disabled:opacity-50">
          {busy ? "…" : "Withdraw"}
        </button>
      </div>
    );
  }
  if (viewer?.registrationStatus === "waitlisted") {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-amber-700">On waitlist (#{viewer.waitlistPos})</span>
        <button onClick={() => onWithdraw(true)} disabled={busy} className="rounded-md px-3 py-2 text-sm text-penn-red hover:bg-penn-red/5 disabled:opacity-50">
          {busy ? "…" : "Leave waitlist"}
        </button>
      </div>
    );
  }
  if (state.notYetOpen) {
    return <DisabledBtn label={`Opens ${fmtOpensLabel(e.signupOpensAt)}`} />;
  }
  if (state.closed) {
    return <DisabledBtn label="Closed" />;
  }
  // Open:
  if (!state.full) {
    return <PrimaryBtn busy={busy} onClick={onRegister} label="Register" busyLabel="Registering…" />;
  }
  if (e.waitlistEnabled) {
    return <PrimaryBtn busy={busy} onClick={onRegister} label={`Join waitlist (${e.waitlistCount} ahead)`} busyLabel="Joining…" />;
  }
  return <DisabledBtn label="Full" />;
}

function TeamArea({
  event: e,
  busy,
  call,
  state,
  onLeave,
}: {
  event: BrowseEvent;
  busy: boolean;
  call: (url: string, opts?: RequestInit) => Promise<any>;
  state: ReturnType<typeof actionState>;
  onLeave: (teamId: string, teamName: string, isCaptain: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const team = e.viewer?.team;

  if (team) {
    return <TeamPanel event={e} team={team} busy={busy} call={call} onLeave={onLeave} />;
  }
  if (state.notYetOpen) return <DisabledBtn label={`Opens ${fmtOpensLabel(e.signupOpensAt)}`} />;
  if (state.closed) return <DisabledBtn label="Closed" />;

  // Cluster-bound teams: you play on your own cluster's single team.
  const cohortId = e.viewer?.cohortId ?? null;
  const cohortName = e.viewer?.cohortName ?? null;
  if (!cohortId) {
    return (
      <p className="text-sm text-ink-muted">
        Set your cluster on{" "}
        <Link href="/me" className="font-semibold text-penn-blue">
          your profile
        </Link>{" "}
        to join or create a team.
      </p>
    );
  }

  const allTeams = e.teams ?? [];
  const myTeam = allTeams.find((t) => t.cohortId === cohortId) ?? null;
  const others = allTeams.filter((t) => t.cohortId !== cohortId);
  const myTeamFull = myTeam != null && e.maxTeamSize != null && myTeam.memberCount >= e.maxTeamSize;

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        Teams are per cluster — you play on the <span className="font-medium text-penn-blue">{cohortName}</span> team.
      </p>

      {myTeam ? (
        myTeamFull ? (
          <DisabledBtn label={`${cohortName} team is full`} />
        ) : (
          <button
            onClick={() => call(`/api/teams/${myTeam.id}/join`, { method: "POST" }).catch(() => {})}
            disabled={busy}
            className="w-full rounded-md bg-penn-blue px-4 py-2.5 font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60"
          >
            {busy ? "Joining…" : `Join the ${cohortName} team (${myTeam.memberCount}/${e.maxTeamSize})`}
          </button>
        )
      ) : !creating ? (
        <button onClick={() => setCreating(true)} className="w-full rounded-md border border-penn-blue px-3 py-2.5 text-sm font-semibold text-penn-blue hover:bg-penn-blue-tint">
          Create the {cohortName} team
        </button>
      ) : (
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            await call(`/api/events/${e.id}/teams`, { method: "POST", body: JSON.stringify({ name }) }).catch(() => {});
          }}
          className="space-y-2"
        >
          <input value={name} onChange={(ev) => setName(ev.target.value)} required placeholder={`e.g. ${cohortName} ${e.name}`} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={busy} className="flex-1 rounded-md bg-penn-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Creating…" : "Create team"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-md px-3 py-2 text-sm text-ink-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {others.length > 0 && (
        <p className="text-xs text-ink-muted">
          Other clusters: {others.map((t) => `${t.cohortName ?? "?"} (${t.memberCount})`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TeamPanel({
  event: e,
  team,
  busy,
  call,
  onLeave,
}: {
  event: BrowseEvent;
  team: NonNullable<NonNullable<BrowseEvent["viewer"]>["team"]>;
  busy: boolean;
  call: (url: string, opts?: RequestInit) => Promise<any>;
  onLeave: (teamId: string, teamName: string, isCaptain: boolean) => void;
}) {
  const need = e.minTeamSize ? Math.max(0, e.minTeamSize - team.memberCount) : 0;
  const statusText =
    team.status === "registered" ? "Registered ✓" : team.status === "waitlisted" ? "On waitlist" : "Forming";
  const statusColor =
    team.status === "registered" ? "text-cohort-dragon" : team.status === "waitlisted" ? "text-amber-700" : "text-ink-muted";

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-serif font-semibold text-penn-blue">{team.name}</span>
        <span className={`font-semibold ${statusColor}`}>{statusText}</span>
      </div>
      {team.status === "forming" && (
        <p className="text-xs text-amber-700">
          Needs {need} more {need === 1 ? "player" : "players"} to reach the {e.minTeamSize}-player minimum.
        </p>
      )}
      {team.isCaptain && team.inviteCode && (
        <p className="text-xs text-ink-muted">
          Share code (optional):{" "}
          <span className="tabular rounded bg-surface-alt px-1.5 py-0.5 font-mono font-bold tracking-widest text-ink">{team.inviteCode}</span>
        </p>
      )}
      <ul className="divide-y divide-border rounded-md border border-border">
        {team.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-ink">
              {m.name} {m.isCaptain && <span className="text-xs text-ink-muted">(captain)</span>}
            </span>
            {team.isCaptain && !m.isCaptain && (
              <button
                onClick={() => call(`/api/teams/${team.id}/members/${m.userId}`, { method: "DELETE" }).catch(() => {})}
                disabled={busy}
                className="text-xs text-penn-red hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onLeave(team.id, team.name, team.isCaptain)}
        disabled={busy}
        className="rounded-md px-3 py-2 text-sm text-penn-red hover:bg-penn-red/5 disabled:opacity-50"
      >
        {team.isCaptain ? "Leave (reassigns captain)" : "Leave team"}
      </button>
    </div>
  );
}

function PrimaryBtn({ busy, onClick, label, busyLabel }: { busy: boolean; onClick: () => void; label: string; busyLabel: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full rounded-md bg-penn-blue px-4 py-2.5 font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function DisabledBtn({ label }: { label: string }) {
  return (
    <button disabled className="w-full cursor-not-allowed rounded-md bg-surface-alt px-4 py-2.5 font-semibold text-ink-muted">
      {label}
    </button>
  );
}
