import { env } from "./env";

/**
 * Email normalization + eligibility (§5.2).
 *
 * Normalize before any uniqueness check: lowercase, trim, and strip plus-addressing
 * (ryan+alt@ → ryan@). Without the plus-strip, one person can mint unlimited
 * accounts and drain limited event slots.
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

/** Domain allowlist check. "any verifiable Penn address," configurable via env. */
export function isAllowedDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return env.allowedEmailDomains.includes(domain);
}

export function isEligible(email: string): boolean {
  return isValidEmailShape(email) && isAllowedDomain(email);
}

// ── Mailer ───────────────────────────────────────────────────────────────────
// One interface so swapping providers (SES ⇄ paid fallback) is a one-file change (§11).

export interface Mailer {
  sendCode(to: string, code: string): Promise<void>;
}

/**
 * Dev mailer. There is no SES in local/demo, so instead of silently dropping the
 * code we log it AND stash the most recent code per address so the /signin UI can
 * surface it. This is dev-only and never compiled into a real deployment path.
 */
class ConsoleMailer implements Mailer {
  async sendCode(to: string, code: string): Promise<void> {
    lastDevCodes.set(to, { code, at: Date.now() });
    // eslint-disable-next-line no-console
    console.log(`\n📧  [dev mailer] ${code} is your Wharton Olympics code  →  ${to}\n`);
  }
}

/**
 * SES mailer (production). Deliberately not wired with the AWS SDK in this build to
 * keep the dependency surface small; the template requirements (§11) are encoded
 * here as the contract: code in the SUBJECT and the body, plain-text-forward, no
 * images/pixels/link-shorteners. Implement `send` with @aws-sdk/client-sesv2.
 */
class SesMailer implements Mailer {
  async sendCode(to: string, code: string): Promise<void> {
    const subject = `${code} is your Wharton Olympics code`;
    const body =
      `${code} is your Wharton Student Olympics sign-in code.\n\n` +
      `It expires in 10 minutes and can be used once. If you didn't request it, ignore this email.\n\n` +
      `— Wharton Student Olympics (a student organization at the University of Pennsylvania)`;
    void subject;
    void body;
    throw new Error(
      "SesMailer not implemented in this build. Wire @aws-sdk/client-sesv2 here and set MAILER=ses. " +
        "Requirements: verified domain with SPF/DKIM/DMARC, code in subject+body, plain-text, no images/pixels."
    );
  }
}

export const lastDevCodes = new Map<string, { code: string; at: number }>();

export function getMailer(): Mailer {
  return env.mailer === "ses" ? new SesMailer() : new ConsoleMailer();
}
