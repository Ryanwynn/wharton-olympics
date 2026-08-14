/** All display formatting renders in America/New_York regardless of server TZ (§7). */
export const APP_TIMEZONE = "America/New_York";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

const dayTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

const fullFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtTime(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? timeFmt.format(d) : "TBD";
}

export function fmtDayTime(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? dayTimeFmt.format(d) : "TBD";
}

export function fmtFull(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? fullFmt.format(d) : "TBD";
}

/** "9:00 AM" style opens-at label for disabled buttons (§6.2). */
export function fmtOpensLabel(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? dayTimeFmt.format(d) : "soon";
}

/** iCalendar UTC stamp: 20260814T130000Z */
export function icsStamp(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Two [start,end] ranges overlap? Used for schedule-conflict detection (§6.2, §6.4). */
export function rangesOverlap(
  aStart: string | Date | null,
  aEnd: string | Date | null,
  bStart: string | Date | null,
  bEnd: string | Date | null
): boolean {
  const as = toDate(aStart)?.getTime();
  const bs = toDate(bStart)?.getTime();
  if (as == null || bs == null) return false;
  // Fall back to a 60-min block when an end time is missing.
  const ae = toDate(aEnd)?.getTime() ?? as + 3600_000;
  const be = toDate(bEnd)?.getTime() ?? bs + 3600_000;
  return as < be && bs < ae;
}
