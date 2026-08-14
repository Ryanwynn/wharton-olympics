/**
 * Public display of a person's name: "First L." — never a full name or email on
 * an unauthenticated surface (§13).
 */
export function publicName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/** Derive a friendly placeholder display name from an email local part. */
export function prettifyLocalPart(email: string): string {
  const local = email.split("@")[0] || "Guest";
  return (
    local
      .replace(/[._+-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "Guest"
  );
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event"
  );
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Map an event's stored status to the public schedule label (§6.1). */
export function statusLabel(status: string): "upcoming" | "in progress" | "final" | "cancelled" {
  switch (status) {
    case "in_progress":
      return "in progress";
    case "complete":
      return "final";
    case "cancelled":
      return "cancelled";
    default:
      return "upcoming";
  }
}
