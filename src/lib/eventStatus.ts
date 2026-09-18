/**
 * A published event automatically shows as live once its start time passes, unless
 * auto_go_live is turned off (e.g. the game is delayed). An explicitly-set
 * in_progress status always counts as live (a manual "go live now"). draft /
 * complete / cancelled pass through unchanged. This is computed at read time so no
 * background job is needed; admins override by toggling auto_go_live or forcing the
 * status. Kept dependency-free so both the server (queries, registration) and
 * client can use it.
 */
export function isEffectivelyLive(
  status: string,
  startsAt: string | Date | null,
  autoGoLive: boolean
): boolean {
  if (status === "in_progress") return true;
  if (status === "published" && autoGoLive && startsAt) {
    return new Date(startsAt).getTime() <= Date.now();
  }
  return false;
}

export function effectiveStatus(
  status: string,
  startsAt: string | Date | null,
  autoGoLive: boolean
): string {
  return isEffectivelyLive(status, startsAt, autoGoLive) ? "in_progress" : status;
}
