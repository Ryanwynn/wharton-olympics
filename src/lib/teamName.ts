const MAX_LEN = 60;

/**
 * Auto-generated team name: "<Cluster> <Event>", e.g. "Dragons Rock Paper Scissors".
 * When a cluster may enter several teams (multi), every team is numbered so they
 * read consistently — "Lions Tug of War Team 1", "… Team 2" — using the lowest
 * number not already taken. A single-team event gets the plain name unless it
 * happens to be taken, in which case it falls back to a numbered name.
 * `taken` holds the event's existing team names (compared case-insensitively).
 */
export function buildTeamName(cohortName: string, eventName: string, multi: boolean, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()));
  const clip = (base: string, suffix: string) => base.slice(0, MAX_LEN - suffix.length).trimEnd() + suffix;
  const base = `${cohortName} ${eventName}`.replace(/\s+/g, " ").trim();

  if (!multi) {
    const plain = clip(base, "");
    if (!used.has(plain.toLowerCase())) return plain;
  }
  for (let n = 1; ; n++) {
    const candidate = clip(base, ` Team ${n}`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
