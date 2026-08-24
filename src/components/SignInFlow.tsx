"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MascotIcon } from "./MascotIcon";
import type { CohortOption } from "@/lib/queries";

export function SignInFlow({
  cohorts,
  googleEnabled,
  domainHint,
  resumeProfile,
}: {
  cohorts: CohortOption[];
  googleEnabled: boolean;
  domainHint: string;
  // Set when an already-signed-in user still needs to finish their profile
  // (new Google account without a cluster yet). Jumps straight to that step.
  resumeProfile?: { displayName: string } | null;
}) {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const errorCode = params.get("error");

  if (resumeProfile) {
    return <ProfileStep cohorts={cohorts} initialName={resumeProfile.displayName} next={next} />;
  }

  const errorMessage =
    errorCode === "domain"
      ? `That Google account isn't a Penn/Wharton address. Sign in with your school Google account (${domainHint}).`
      : errorCode === "unverified"
      ? "That Google account's email isn't verified."
      : errorCode === "nogoogle"
      ? "Google sign-in isn't configured yet."
      : errorCode
      ? "Sign-in didn't complete. Please try again."
      : null;

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="font-serif text-2xl font-bold text-penn-blue">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">Use your Penn or Wharton Google account.</p>

      {errorMessage && (
        <div role="alert" className="mt-4 rounded-md border border-penn-red/30 bg-penn-red/5 px-3 py-2 text-sm text-penn-red">
          {errorMessage}
        </div>
      )}

      <a
        href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-3 font-semibold text-ink no-underline shadow-sm hover:bg-surface-alt"
      >
        <GoogleGlyph />
        Continue with Google
      </a>
      <p className="mt-3 text-xs text-ink-muted">
        Only {domainHint} accounts can sign in. We use Google just to confirm you&rsquo;re a Penn student — we never see
        your password.
      </p>

      {!googleEnabled && <DevLogin next={next} />}
    </div>
  );
}

// ── First-time profile step (kept from the old flow) ───────────────────────────
function ProfileStep({ cohorts, initialName, next }: { cohorts: CohortOption[]; initialName: string; next: string }) {
  const [displayName, setDisplayName] = useState(initialName);
  const [cohortId, setCohortId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cohortId) {
      setError("Choose your cluster.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: displayName, cohort_id: cohortId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your profile.");
      window.location.assign(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="font-serif text-2xl font-bold text-penn-blue">Welcome!</h1>
      <p className="mt-1 text-sm text-ink-muted">One quick step to finish setting up your account.</p>
      {error && (
        <div role="alert" className="mt-4 rounded-md border border-penn-red/30 bg-penn-red/5 px-3 py-2 text-sm text-penn-red">
          {error}
        </div>
      )}
      <form onSubmit={save} className="mt-6 space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink">
            Display name
          </label>
          <input
            id="name"
            autoFocus
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-penn-blue"
          />
          <p className="mt-1 text-xs text-ink-muted">Public results show only your first name and last initial.</p>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-ink">Your cluster</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {cohorts.map((c) => {
              const selected = cohortId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCohortId(c.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left ${
                    selected ? "border-penn-blue bg-penn-blue-tint" : "border-border bg-surface hover:bg-surface-alt"
                  }`}
                >
                  <MascotIcon icon={c.iconKey} size={26} color={c.colorHex} />
                  <span className="font-serif font-semibold text-penn-blue">{c.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-penn-blue px-4 py-3 font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60"
        >
          {loading ? "Saving…" : "Finish & continue"}
        </button>
      </form>
    </div>
  );
}

// ── Dev-only login (shown only when Google isn't configured, i.e. local dev) ────
function DevLogin({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dev login failed.");
      window.location.assign(data.needsProfile ? `/signin?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 rounded-md border border-dashed border-border bg-surface-alt p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Dev login (local only)</p>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@upenn.edu"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button disabled={loading} className="rounded-md bg-penn-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "…" : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-penn-red">{error}</p>}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
