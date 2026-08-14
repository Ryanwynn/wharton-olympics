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

  allowedEmailDomains: (
    process.env.ALLOWED_EMAIL_DOMAINS ||
    "upenn.edu,wharton.upenn.edu,seas.upenn.edu,sas.upenn.edu,law.upenn.edu,nursing.upenn.edu,gse.upenn.edu,design.upenn.edu,vet.upenn.edu,pennmedicine.upenn.edu"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || "30"),
  privilegedSessionHours: 12, // admin/scorekeeper step-down (§5.5)

  mailer: (process.env.MAILER || "console").toLowerCase(),
  sesFrom: process.env.SES_FROM || "Wharton Olympics <noreply@example.org>",
  awsRegion: process.env.AWS_REGION || "us-east-1",

  organizerContact: process.env.ORGANIZER_CONTACT_EMAIL || "olympics@wharton.upenn.edu",

  isProd: process.env.NODE_ENV === "production",
};
