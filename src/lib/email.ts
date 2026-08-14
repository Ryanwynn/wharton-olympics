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
 * Template shared by real providers (§11 deliverability): code in the SUBJECT and
 * the body, plain-text-forward (no HTML/images/pixels/link-shorteners — every one
 * raises the spam score at a .upenn.edu address).
 */
function codeEmail(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is your Wharton Olympics code`,
    text:
      `${code} is your Wharton Student Olympics sign-in code.\n\n` +
      `It expires in 10 minutes and can be used once. If you didn't request it, ignore this email.\n\n` +
      `— Wharton Student Olympics (a student organization at the University of Pennsylvania)`,
  };
}

/**
 * Resend mailer (recommended for production). No SDK — a single HTTPS call, so it
 * runs anywhere including Vercel serverless. Requires a verified sending domain
 * (SPF/DKIM added to that domain's DNS) and RESEND_API_KEY.
 */
class ResendMailer implements Mailer {
  async sendCode(to: string, code: string): Promise<void> {
    const { subject, text } = codeEmail(code);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: env.mailFrom, to, subject, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}

/**
 * SES mailer (cheapest at scale, but new accounts are sandboxed until AWS grants
 * production access — request it early). Left unimplemented to avoid the AWS SDK
 * dependency; prefer Resend. To use SES: `npm i @aws-sdk/client-sesv2`, send with
 * the same `codeEmail()` template, and set MAILER=ses.
 */
class SesMailer implements Mailer {
  async sendCode(): Promise<void> {
    throw new Error(
      "MAILER=ses is not implemented in this build. Use MAILER=resend (recommended), or wire " +
        "@aws-sdk/client-sesv2 into SesMailer. Either way: verify a sending domain with SPF/DKIM/DMARC."
    );
  }
}

export const lastDevCodes = new Map<string, { code: string; at: number }>();

export function getMailer(): Mailer {
  switch (env.mailer) {
    case "resend":
      if (!env.resendApiKey) {
        throw new Error("MAILER=resend but RESEND_API_KEY is not set. Add it to your environment (e.g. Vercel → Settings → Environment Variables).");
      }
      return new ResendMailer();
    case "ses":
      return new SesMailer();
    default:
      return new ConsoleMailer();
  }
}
