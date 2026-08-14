import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getMyAgenda } from "@/lib/queries";
import { icsStamp } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// A plain .ics download — no third-party calendar integration (§6.3).
export const GET = route(async () => {
  const user = await requireUser();
  const agenda = await getMyAgenda(user.id);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wharton Student Olympics//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Wharton Student Olympics",
  ];
  for (const it of agenda) {
    if (!it.startsAt) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${it.eventId}-${user.id}@wharton-olympics`);
    lines.push(`DTSTAMP:${icsStamp(new Date())}`);
    lines.push(`DTSTART:${icsStamp(it.startsAt)}`);
    if (it.endsAt) lines.push(`DTEND:${icsStamp(it.endsAt)}`);
    lines.push(`SUMMARY:${esc(it.eventName)}${it.registrationStatus === "waitlisted" ? " (waitlist)" : ""}`);
    const loc = [it.location, it.locationNote].filter(Boolean).join(" — ");
    if (loc) lines.push(`LOCATION:${esc(loc)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wharton-olympics.ics"',
    },
  });
});
