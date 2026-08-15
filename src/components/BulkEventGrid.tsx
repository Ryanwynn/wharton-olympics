"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, eventStatusLabel } from "@/lib/format";
import { api } from "./AdminConsole";
import type { AdminEvent } from "./AdminConsole";

/**
 * Spreadsheet-style bulk editor for events — organizers fill/edit a grid of many
 * events at once instead of one form at a time. It shows draft AND published events
 * (both editable), plus blank rows for new ones. Each dirty row is saved via the
 * same create (POST) / edit (PATCH) endpoints as the single-event form, so new and
 * existing rows save together. New rows are created as drafts.
 */

interface Row {
  key: string;
  id?: string;
  status: string; // event status for existing rows, "new" for blank rows
  name: string;
  entry_type: "individual" | "team";
  capacity: string;
  min_team_size: string;
  max_team_size: string;
  location: string;
  location_note: string;
  description: string;
  starts_at: string;
  ends_at: string;
  signup_opens_at: string;
  signup_closes_at: string;
  p1: string;
  p2: string;
  p3: string;
  pp: string;
  waitlist_enabled: boolean;
  dirty: boolean;
  error: string | null;
  saved: boolean;
}

let nextKey = 0;
const newKey = () => `r${nextKey++}`;

function blankRow(): Row {
  return {
    key: newKey(),
    status: "new",
    name: "",
    entry_type: "individual",
    capacity: "24",
    min_team_size: "3",
    max_team_size: "5",
    location: "",
    location_note: "",
    description: "",
    starts_at: "",
    ends_at: "",
    signup_opens_at: "",
    signup_closes_at: "",
    p1: "15",
    p2: "10",
    p3: "6",
    pp: "2",
    waitlist_enabled: true,
    dirty: false,
    error: null,
    saved: false,
  };
}

function fromEvent(e: AdminEvent): Row {
  const ps = e.pointsSchema ?? {};
  return {
    key: newKey(),
    id: e.id,
    status: e.status,
    name: e.name,
    entry_type: e.entryType,
    capacity: e.capacity == null ? "" : String(e.capacity),
    min_team_size: e.minTeamSize == null ? "3" : String(e.minTeamSize),
    max_team_size: e.maxTeamSize == null ? "5" : String(e.maxTeamSize),
    location: e.location ?? "",
    location_note: e.locationNote ?? "",
    description: e.description ?? "",
    starts_at: toDatetimeLocal(e.startsAt),
    ends_at: toDatetimeLocal(e.endsAt),
    signup_opens_at: toDatetimeLocal(e.signupOpensAt),
    signup_closes_at: toDatetimeLocal(e.signupClosesAt),
    p1: String(ps["1"] ?? 15),
    p2: String(ps["2"] ?? 10),
    p3: String(ps["3"] ?? 6),
    pp: String(ps["participation"] ?? 2),
    waitlist_enabled: e.waitlistEnabled,
    dirty: false,
    error: null,
    saved: false,
  };
}

function buildBody(r: Row) {
  const iso = (v: string) => (v ? new Date(v).toISOString() : null);
  const body: Record<string, unknown> = {
    name: r.name.trim(),
    description: r.description || null,
    capacity: r.capacity ? Number(r.capacity) : null,
    waitlist_enabled: r.waitlist_enabled,
    location: r.location || null,
    location_note: r.location_note || null,
    starts_at: iso(r.starts_at),
    ends_at: iso(r.ends_at),
    signup_opens_at: iso(r.signup_opens_at),
    signup_closes_at: iso(r.signup_closes_at),
    points_schema: { "1": Number(r.p1) || 0, "2": Number(r.p2) || 0, "3": Number(r.p3) || 0, participation: Number(r.pp) || 0 },
  };
  if (r.entry_type === "team") {
    body.min_team_size = Number(r.min_team_size) || 0;
    body.max_team_size = Number(r.max_team_size) || 0;
  }
  return body;
}

const EDITABLE_STATUSES = new Set(["draft", "published"]);

export function BulkEventGrid({ events, onSaved }: { events: AdminEvent[]; onSaved: () => void }) {
  const router = useRouter();
  const editable = events.filter((e) => EDITABLE_STATUSES.has(e.status));
  const [rows, setRows] = useState<Row[]>(() => [...editable.map(fromEvent), blankRow(), blankRow()]);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));

  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  async function saveAll() {
    setSaving(true);
    setSummary(null);
    const next = [...rows];
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const r of next) {
      const isEmptyNew = !r.id && !r.name.trim();
      if (!r.dirty || isEmptyNew) continue;
      try {
        const body = buildBody(r);
        if (r.id) {
          await api(`/api/admin/events/${r.id}`, { method: "PATCH", body: JSON.stringify(body) });
          updated++;
        } else {
          const res = await api("/api/admin/events", { method: "POST", body: JSON.stringify({ ...body, entry_type: r.entry_type }) });
          r.id = res.id;
          r.status = "draft";
          created++;
        }
        r.dirty = false;
        r.error = null;
        r.saved = true;
      } catch (e) {
        r.error = (e as Error).message;
        r.saved = false;
        failed++;
      }
    }
    setRows(next);
    setSaving(false);
    setSummary(`${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}.`);
    router.refresh();
    onSaved();
  }

  const cell = "rounded border border-border px-2 py-1 text-sm";
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        Add and edit multiple events at once — both <span className="font-medium">draft</span> and{" "}
        <span className="font-medium">published</span> events are editable here. Fill any number of rows and save them
        together; new rows are created as drafts. Times are in your local timezone.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[1500px] border-collapse text-left">
          <thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              {["Status", "Name", "Type", "Cap", "Min", "Max", "Location", "Loc. note", "Description", "Starts", "Ends", "Signup opens", "Signup closes", "1st", "2nd", "3rd", "Part.", "WL", ""].map(
                (h, i) => (
                  <th key={`${h}-${i}`} className="whitespace-nowrap px-2 py-2 font-semibold">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t border-border align-top ${r.error ? "bg-penn-red/5" : ""}`}>
                <td className="px-2 py-1.5">
                  <StatusCell row={r} />
                </td>
                <td className="px-2 py-1.5">
                  <input className={`${cell} w-40`} value={r.name} placeholder="Event name" onChange={(e) => update(r.key, { name: e.target.value })} />
                  {r.error && <div className="mt-0.5 max-w-[10rem] text-[11px] text-penn-red">{r.error}</div>}
                  {r.saved && !r.dirty && <div className="mt-0.5 text-[11px] text-cohort-dragon">Saved ✓</div>}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className={`${cell} w-28 disabled:bg-surface-alt disabled:text-ink-muted`}
                    value={r.entry_type}
                    disabled={Boolean(r.id)}
                    title={r.id ? "Entry type can't change after creation" : undefined}
                    onChange={(e) => update(r.key, { entry_type: e.target.value as "individual" | "team" })}
                  >
                    <option value="individual">Individual</option>
                    <option value="team">Team</option>
                  </select>
                </td>
                <td className="px-2 py-1.5"><input type="number" className={`${cell} w-16`} value={r.capacity} onChange={(e) => update(r.key, { capacity: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" disabled={r.entry_type !== "team"} className={`${cell} w-14 disabled:bg-surface-alt`} value={r.entry_type === "team" ? r.min_team_size : ""} onChange={(e) => update(r.key, { min_team_size: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" disabled={r.entry_type !== "team"} className={`${cell} w-14 disabled:bg-surface-alt`} value={r.entry_type === "team" ? r.max_team_size : ""} onChange={(e) => update(r.key, { max_team_size: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={`${cell} w-36`} value={r.location} onChange={(e) => update(r.key, { location: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={`${cell} w-36`} value={r.location_note} placeholder="e.g. Meet at north gate" onChange={(e) => update(r.key, { location_note: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={`${cell} w-52`} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="datetime-local" className={`${cell} w-44`} value={r.starts_at} onChange={(e) => update(r.key, { starts_at: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="datetime-local" className={`${cell} w-44`} value={r.ends_at} onChange={(e) => update(r.key, { ends_at: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="datetime-local" className={`${cell} w-44`} value={r.signup_opens_at} onChange={(e) => update(r.key, { signup_opens_at: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="datetime-local" className={`${cell} w-44`} value={r.signup_closes_at} onChange={(e) => update(r.key, { signup_closes_at: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" className={`${cell} w-12`} value={r.p1} onChange={(e) => update(r.key, { p1: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" className={`${cell} w-12`} value={r.p2} onChange={(e) => update(r.key, { p2: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" className={`${cell} w-12`} value={r.p3} onChange={(e) => update(r.key, { p3: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" className={`${cell} w-12`} value={r.pp} onChange={(e) => update(r.key, { pp: e.target.value })} /></td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.waitlist_enabled} onChange={(e) => update(r.key, { waitlist_enabled: e.target.checked })} /></td>
                <td className="px-2 py-1.5">
                  {!r.id && (
                    <button onClick={() => removeRow(r.key)} className="rounded px-1.5 py-1 text-xs text-penn-red hover:bg-penn-red/5" title="Remove row">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={addRow} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt">
          + Add row
        </button>
        <button onClick={saveAll} disabled={saving} className="rounded-md bg-penn-blue px-4 py-2 text-sm font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60">
          {saving ? "Saving…" : "Save all"}
        </button>
        {summary && <span className="text-sm text-ink-muted">{summary}</span>}
      </div>
    </div>
  );
}

function StatusCell({ row }: { row: Row }) {
  if (row.status === "new") {
    return <span className="whitespace-nowrap rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-ink-muted">New</span>;
  }
  const cls =
    row.status === "published"
      ? "bg-penn-blue-tint text-penn-blue"
      : row.status === "draft"
      ? "bg-surface-alt text-ink-muted"
      : "bg-surface-alt text-ink-muted";
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{eventStatusLabel(row.status)}</span>;
}
