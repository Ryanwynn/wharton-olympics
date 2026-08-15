"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDayTime, fmtTime } from "@/lib/time";
import { entryTypeLabel, eventStatusLabel } from "@/lib/format";
import type { CohortOption } from "@/lib/queries";

export interface AdminEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  entryType: "individual" | "team";
  status: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationNote: string | null;
  signupOpensAt: string | null;
  signupClosesAt: string | null;
  pointsSchema: Record<string, number> | null;
  registered: number;
  waitlisted: number;
}
export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  createdAt: string;
}

async function api(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function AdminConsole({
  initialEvents,
  cohorts,
  initialAudit,
}: {
  initialEvents: AdminEvent[];
  cohorts: CohortOption[];
  initialAudit: AuditEntry[];
}) {
  const [tab, setTab] = useState<"events" | "people" | "audit">("events");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Organizer console</h1>
        <p className="text-sm text-ink-muted">Create events, manage rosters, score, and grant roles.</p>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-border">
        {(["events", "people", "audit"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize ${
              tab === t ? "border-penn-blue text-penn-blue" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "events" && <EventsTab events={initialEvents} cohorts={cohorts} />}
      {tab === "people" && <PeopleTab events={initialEvents} />}
      {tab === "audit" && <AuditTab initial={initialAudit} />}
    </div>
  );
}

// ── Events tab ──────────────────────────────────────────────────────────────────
function EventsTab({ events, cohorts }: { events: AdminEvent[]; cohorts: CohortOption[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function toggle(ev: AdminEvent) {
    setError(null);
    try {
      await api(`/api/admin/events/${ev.id}/publish`, { method: "POST", body: JSON.stringify({ publish: ev.status === "draft" }) });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(ev: AdminEvent) {
    if (!confirm(`Delete "${ev.name}"? This removes its registrations and scores.`)) return;
    try {
      await api(`/api/admin/events/${ev.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-penn-red/5 px-3 py-2 text-sm text-penn-red">{error}</p>}
      <button onClick={() => setCreating((v) => !v)} className="rounded-md bg-penn-blue px-4 py-2 text-sm font-semibold text-white hover:bg-penn-blue-hover">
        {creating ? "Close" : "+ New event"}
      </button>
      {creating && <EventForm onDone={() => { setCreating(false); router.refresh(); }} />}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface-alt text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Reg / Cap</th>
              <th className="px-3 py-2 text-right">Wait</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <Fragment key={ev.id}>
                <tr className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{ev.name}</div>
                    <div className="text-xs text-ink-muted">{entryTypeLabel(ev.entryType)} · {fmtDayTime(ev.startsAt)} · {ev.location ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2"><StatusTag status={ev.status} /></td>
                  <td className="tabular px-3 py-2 text-right">{ev.registered}/{ev.capacity ?? "∞"}</td>
                  <td className="tabular px-3 py-2 text-right">{ev.waitlisted}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {(ev.status === "draft" || ev.status === "published") && (
                        <button onClick={() => toggle(ev)} className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-alt">
                          {ev.status === "draft" ? "Publish" : "Unpublish"}
                        </button>
                      )}
                      {/* Draft (created-but-not-published, or unpublished) events are editable. */}
                      {ev.status === "draft" && (
                        <button onClick={() => setEditingId(editingId === ev.id ? null : ev.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-alt">
                          {editingId === ev.id ? "Close" : "Edit"}
                        </button>
                      )}
                      <button onClick={() => setOpenRoster(openRoster === ev.id ? null : ev.id)} className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-alt">
                        Roster
                      </button>
                      <Link href={`/score/${ev.id}`} className="rounded border border-border px-2 py-1 text-xs text-penn-blue no-underline hover:bg-surface-alt">
                        Score
                      </Link>
                      <button onClick={() => remove(ev)} className="rounded border border-border px-2 py-1 text-xs text-penn-red hover:bg-penn-red/5">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === ev.id && (
                  <tr>
                    <td colSpan={5} className="border-t border-border bg-surface-alt px-3 py-3">
                      <EventForm event={ev} onDone={() => { setEditingId(null); router.refresh(); }} />
                    </td>
                  </tr>
                )}
                {openRoster === ev.id && (
                  <tr>
                    <td colSpan={5} className="border-t border-border bg-surface-alt px-3 py-3">
                      <RosterPanel event={ev} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <PointsHint cohorts={cohorts} />
    </div>
  );
}

function PointsHint({ cohorts }: { cohorts: CohortOption[] }) {
  return (
    <p className="text-xs text-ink-muted">
      {cohorts.length} clusters: {cohorts.map((c) => c.name).join(", ")}. Points are per-event; set a schema when creating.
    </p>
  );
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-surface-alt text-ink-muted",
    published: "bg-penn-blue-tint text-penn-blue",
    in_progress: "bg-penn-red/10 text-penn-red",
    complete: "bg-cohort-dragon/10 text-cohort-dragon",
    cancelled: "bg-surface-alt text-ink-muted line-through",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-surface-alt"}`}>{eventStatusLabel(status)}</span>;
}

/** Convert a stored ISO timestamp to a `datetime-local` value in the browser's tz. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialForm(event?: AdminEvent) {
  if (!event) {
    return { entry_type: "individual", waitlist_enabled: true, capacity: 24, min_team_size: 3, max_team_size: 5, p1: 15, p2: 10, p3: 6, pp: 2 } as any;
  }
  const ps = event.pointsSchema ?? {};
  return {
    name: event.name,
    description: event.description ?? "",
    entry_type: event.entryType,
    capacity: event.capacity ?? "",
    waitlist_enabled: event.waitlistEnabled,
    min_team_size: event.minTeamSize ?? 3,
    max_team_size: event.maxTeamSize ?? 5,
    location: event.location ?? "",
    location_note: event.locationNote ?? "",
    starts_at: toLocalInput(event.startsAt),
    ends_at: toLocalInput(event.endsAt),
    signup_opens_at: toLocalInput(event.signupOpensAt),
    signup_closes_at: toLocalInput(event.signupClosesAt),
    p1: ps["1"] ?? 15, p2: ps["2"] ?? 10, p3: ps["3"] ?? 6, pp: ps["participation"] ?? 2,
  } as any;
}

// Shared create/edit form. With `event` it PATCHes (edit); without, it POSTs (create).
function EventForm({ event, onDone }: { event?: AdminEvent; onDone: () => void }) {
  const isEdit = Boolean(event);
  const [f, setF] = useState<any>(() => initialForm(event));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((prev: any) => ({ ...prev, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: any = {
        name: f.name,
        description: f.description || null,
        capacity: f.capacity ? Number(f.capacity) : null,
        waitlist_enabled: f.waitlist_enabled,
        location: f.location || null,
        location_note: f.location_note || null,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
        signup_opens_at: f.signup_opens_at ? new Date(f.signup_opens_at).toISOString() : null,
        signup_closes_at: f.signup_closes_at ? new Date(f.signup_closes_at).toISOString() : null,
        points_schema: { "1": Number(f.p1), "2": Number(f.p2), "3": Number(f.p3), participation: Number(f.pp) },
      };
      if (f.entry_type === "team") { body.min_team_size = Number(f.min_team_size); body.max_team_size = Number(f.max_team_size); }
      if (isEdit) {
        await api(`/api/admin/events/${event!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        body.entry_type = f.entry_type; // entry type is set at creation and immutable after
        await api("/api/admin/events", { method: "POST", body: JSON.stringify(body) });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-0.5 w-full rounded-md border border-border px-2.5 py-2 text-sm";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
      {error && <p className="sm:col-span-2 rounded bg-penn-red/5 px-2 py-1 text-sm text-penn-red">{error}</p>}
      {isEdit && <p className="sm:col-span-2 text-sm font-semibold text-ink">Editing “{event!.name}”</p>}
      <label className="text-xs font-medium text-ink-muted sm:col-span-2">Name<input required className={input} value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted sm:col-span-2">Description<input className={input} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Entry type
        <select disabled={isEdit} title={isEdit ? "Entry type can't change after creation" : undefined} className={`${input} disabled:bg-surface-alt disabled:text-ink-muted`} value={f.entry_type} onChange={(e) => set("entry_type", e.target.value)}>
          <option value="individual">Individual</option>
          <option value="team">Team</option>
        </select>
      </label>
      <label className="text-xs font-medium text-ink-muted">Capacity<input type="number" className={input} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} /></label>
      {f.entry_type === "team" && (
        <>
          <label className="text-xs font-medium text-ink-muted">Min team size<input type="number" className={input} value={f.min_team_size} onChange={(e) => set("min_team_size", e.target.value)} /></label>
          <label className="text-xs font-medium text-ink-muted">Max team size<input type="number" className={input} value={f.max_team_size} onChange={(e) => set("max_team_size", e.target.value)} /></label>
        </>
      )}
      <label className="text-xs font-medium text-ink-muted">Location<input className={input} value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Location note<input className={input} value={f.location_note ?? ""} onChange={(e) => set("location_note", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Starts<input type="datetime-local" className={input} value={f.starts_at ?? ""} onChange={(e) => set("starts_at", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Ends<input type="datetime-local" className={input} value={f.ends_at ?? ""} onChange={(e) => set("ends_at", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Signup opens<input type="datetime-local" className={input} value={f.signup_opens_at ?? ""} onChange={(e) => set("signup_opens_at", e.target.value)} /></label>
      <label className="text-xs font-medium text-ink-muted">Signup closes<input type="datetime-local" className={input} value={f.signup_closes_at ?? ""} onChange={(e) => set("signup_closes_at", e.target.value)} /></label>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-medium text-ink-muted">Points schema</legend>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {[["p1", "1st"], ["p2", "2nd"], ["p3", "3rd"], ["pp", "Part."]].map(([k, label]) => (
            <label key={k} className="text-[11px] text-ink-muted">{label}<input type="number" className={input} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.waitlist_enabled} onChange={(e) => set("waitlist_enabled", e.target.checked)} /> Enable waitlist</label>
      <button disabled={busy} className="rounded-md bg-penn-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
        {busy ? "Saving…" : isEdit ? "Save changes" : "Create event (as draft)"}
      </button>
    </form>
  );
}

function RosterPanel({ event }: { event: AdminEvent }) {
  const router = useRouter();
  const [data, setData] = useState<{ entries: any[] } | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/events/${event.id}/registrations`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [event.id]);
  useEffect(() => { load(); }, [load]);

  async function promote(regId: string) {
    try { await api(`/api/admin/registrations/${regId}/promote`, { method: "POST" }); await load(); router.refresh(); } catch (e) { setError((e as Error).message); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try { await api(`/api/admin/events/${event.id}/registrations`, { method: "POST", body: JSON.stringify({ email: addEmail }) }); setAddEmail(""); await load(); router.refresh(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-penn-red/5 px-2 py-1 text-sm text-penn-red">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/admin/events/${event.id}/export.csv`} className="rounded border border-border bg-surface px-2 py-1 text-xs font-semibold text-penn-blue no-underline">Export CSV</a>
        {event.entryType === "individual" && (
          <form onSubmit={add} className="flex items-center gap-1">
            <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="add by email" className="rounded border border-border px-2 py-1 text-xs" />
            <button className="rounded bg-penn-blue px-2 py-1 text-xs font-semibold text-white">Add</button>
          </form>
        )}
      </div>
      {!data ? (
        <p className="text-sm text-ink-muted">Loading roster…</p>
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-ink-muted">No registrations yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {data.entries.map((e) => (
            <li key={e.registrationId} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="flex items-center gap-2">
                <span className="text-ink">{e.label}</span>
                {e.status === "waitlisted" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">waitlist #{e.waitlistPos}</span>}
                {e.conflict && <span title={`Overlaps ${e.conflict.name}`} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">⚠ conflict</span>}
              </span>
              {e.status === "waitlisted" && (
                <button onClick={() => promote(e.registrationId)} className="rounded border border-border px-2 py-0.5 text-xs text-penn-blue hover:bg-surface-alt">Promote</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── People tab ──────────────────────────────────────────────────────────────────
function PeopleTab({ events }: { events: AdminEvent[] }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<"admin" | "scorekeeper">("scorekeeper");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setGrantMsg(null);
    setError(null);
    try {
      const d = await api("/api/admin/grant", { method: "POST", body: JSON.stringify({ email: grantEmail, role: grantRole }) });
      setGrantMsg(`${grantRole} granted to ${d.user.email}${d.created ? " — pre-registered, active on their first sign-in" : ""}.`);
      setGrantEmail("");
      if (q.trim().length >= 2) setQ((v) => v); // leave search as-is
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (q.trim().length < 2) { setUsers([]); return; }
    const t = setTimeout(async () => {
      try { const d = await api(`/api/admin/users?q=${encodeURIComponent(q)}`); setUsers(d.users); } catch (e) { setError((e as Error).message); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function setRole(userId: string, patch: any) {
    try { await api(`/api/admin/users/${userId}/roles`, { method: "PATCH", body: JSON.stringify(patch) }); setUsers((u) => u.map((x) => (x.id === userId ? { ...x, ...patch } : x))); } catch (e) { setError((e as Error).message); }
  }
  async function assign(userId: string, eventId: string) {
    if (!eventId) return;
    try { await api(`/api/admin/events/${eventId}/scorekeepers`, { method: "POST", body: JSON.stringify({ userId, assigned: true }) }); setUsers((u) => u.map((x) => (x.id === userId ? { ...x, isScorekeeper: true } : x))); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-penn-red/5 px-2 py-1 text-sm text-penn-red">{error}</p>}

      {/* Quick add: grant a role by email, even before the person has signed in. */}
      <form onSubmit={grant} className="rounded-xl border border-border bg-surface-alt p-3">
        <p className="mb-2 text-sm font-semibold text-ink">Add an organizer</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            placeholder="name@upenn.edu"
            className="min-w-[12rem] flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <select value={grantRole} onChange={(e) => setGrantRole(e.target.value as "admin" | "scorekeeper")} className="rounded-md border border-border px-3 py-2 text-sm">
            <option value="scorekeeper">Scorekeeper</option>
            <option value="admin">Admin</option>
          </select>
          <button className="rounded-md bg-penn-blue px-4 py-2 text-sm font-semibold text-white hover:bg-penn-blue-hover">Grant</button>
        </div>
        {grantMsg && <p className="mt-2 text-xs font-medium text-cohort-dragon">{grantMsg}</p>}
        <p className="mt-1 text-xs text-ink-muted">Scorekeepers can update scores live; assign them to specific events below. Admins can do everything.</p>
      </form>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search existing users by name or email…" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div>
              <div className="font-medium text-ink">{u.displayName}</div>
              <div className="text-xs text-ink-muted">{u.email}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={u.isAdmin} onChange={(e) => setRole(u.id, { is_admin: e.target.checked })} /> Admin</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={u.isScorekeeper} onChange={(e) => setRole(u.id, { is_scorekeeper: e.target.checked })} /> Scorekeeper</label>
              <select onChange={(e) => { assign(u.id, e.target.value); e.currentTarget.selectedIndex = 0; }} className="rounded border border-border px-1.5 py-1 text-xs">
                <option value="">Assign to event…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
          </li>
        ))}
        {q.trim().length >= 2 && users.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">No matches.</li>}
      </ul>
    </div>
  );
}

// ── Audit tab ───────────────────────────────────────────────────────────────────
function AuditTab({ initial }: { initial: AuditEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      const qs = new URLSearchParams();
      if (actor) qs.set("actor", actor);
      if (entity) qs.set("entity", entity);
      try { const d = await api(`/api/admin/audit?${qs}`); setEntries(d.entries); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [actor, entity]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter by actor" className="rounded-md border border-border px-3 py-1.5 text-sm" />
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded-md border border-border px-3 py-1.5 text-sm">
          <option value="">All entities</option>
          {["event", "registration", "team", "user", "season"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {entries.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span><span className="font-mono text-xs text-penn-blue">{a.action}</span> <span className="text-ink-muted">on {a.entityType}</span></span>
            <span className="text-xs text-ink-muted">{a.actor} · {fmtTime(a.createdAt)}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="px-3 py-3 text-ink-muted">No audit entries.</li>}
      </ul>
    </div>
  );
}
