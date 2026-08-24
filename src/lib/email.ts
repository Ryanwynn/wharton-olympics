import { env } from "./env";

/**
 * Email normalization + domain eligibility. Used to check the email on a verified
 * Google account (and the dev login) against the allowed Penn/Wharton domains.
 *
 * Normalize before any uniqueness check: lowercase, trim, and strip plus-addressing
 * (ryan+alt@ → ryan@) so one identity maps to one account.
 */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed; // not a valid-looking address; caller validates shape
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  return `${local}@${domain}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailShape(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Domain allowlist check (ALLOWED_EMAIL_DOMAINS). */
export function isAllowedDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return env.allowedEmailDomains.includes(domain);
}

export function isEligible(email: string): boolean {
  return isValidEmailShape(email) && isAllowedDomain(email);
}
