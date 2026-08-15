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

  // Code-request rate limits (§5.4), env-overridable. Defaults are more forgiving
  // than the spec's 3/10/10: repeated testing tripped them, and the per-IP cap must
  // be generous because hundreds of users on shared campus wifi egress from the same
  // IPs on event day. Per-email is the real anti-abuse control (plus-tags stripped).
  rateCodeEmailHour: Number(process.env.RATE_CODE_EMAIL_HOUR || "6"),
  rateCodeEmailDay: Number(process.env.RATE_CODE_EMAIL_DAY || "20"),
  rateCodeIpHour: Number(process.env.RATE_CODE_IP_HOUR || "60"),

  // Mailer selection: "console" (dev), "resend" (recommended in prod), or "ses".
  mailer: (process.env.MAILER || "console").toLowerCase(),
  // Verified sender on whartonolympics.com (verify the domain in Resend, add its
  // DNS records). Override per-environment with MAIL_FROM if needed.
  mailFrom: process.env.MAIL_FROM || process.env.SES_FROM || "Wharton Olympics <noreply@whartonolympics.com>",
  resendApiKey: process.env.RESEND_API_KEY || "",
  awsRegion: process.env.AWS_REGION || "us-east-1",

  organizerContact: process.env.ORGANIZER_CONTACT_EMAIL || "olympics@wharton.upenn.edu",

  isProd: process.env.NODE_ENV === "production",
};
