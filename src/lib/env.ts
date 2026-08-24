/**
 * Centralized environment access. Keep every process.env read here so config is
 * auditable in one place and defaults are explicit.
 */

export const env = {
  databaseUrl: process.env.DATABASE_URL || null, // null → embedded PGlite (local dev)
  pgDataDir: process.env.PGDATA_DIR || ".pgdata",

  authSecret: process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me",

  seedAdminEmails: (process.env.SEED_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Allowed sign-in domains (checked against the Google account's email). The
  // requested penn.edu / wharton.penn.edu are first; the real Penn domains
  // (upenn.edu family) are included so login still works if students are on those.
  // Tighten by setting ALLOWED_EMAIL_DOMAINS.
  allowedEmailDomains: (
    process.env.ALLOWED_EMAIL_DOMAINS ||
    "penn.edu,wharton.penn.edu,upenn.edu,wharton.upenn.edu,seas.upenn.edu,sas.upenn.edu,nursing.upenn.edu,gse.upenn.edu,design.upenn.edu"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || "30"),
  privilegedSessionHours: 12, // admin/scorekeeper step-down (§5.5)

  // Google OAuth — "Sign in with Google". Create an OAuth 2.0 Client (Web) in the
  // Google Cloud console; set these in the environment.
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  // Public base URL used to build the OAuth redirect URI (must match the one
  // registered in Google). e.g. https://whartonolympics.com. Falls back to the
  // request origin when unset (fine for local dev).
  appUrl: (process.env.APP_URL || "").replace(/\/+$/, ""),

  isProd: process.env.NODE_ENV === "production",
};
