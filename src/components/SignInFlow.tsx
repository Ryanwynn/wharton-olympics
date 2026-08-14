"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MascotIcon } from "./MascotIcon";
import type { CohortOption } from "@/lib/queries";

type Step = "email" | "code" | "profile";

export function SignInFlow({
  cohorts,
  organizerContact,
  resumeProfile,
}: {
  cohorts: CohortOption[];
  organizerContact: string;
  // Set when an already-signed-in user still needs to finish their profile
  // (e.g. they verified before any clusters existed). Jumps straight to that step.
  resumeProfile?: { displayName: string } | null;
}) {
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [step, setStep] = useState<Step>(resumeProfile ? "profile" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState(resumeProfile?.displayName ?? "");
  const [cohortId, setCohortId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setDevCode(null);
    setWaited(false);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send a code.");
      setStep("code");
      if (data.devCode) setDevCode(data.devCode);
      // "Didn't get it?" fallback after 60s (§11).
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setWaited(true), 60_000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not verify that code.");
      if (data.needsProfile) {
        setDisplayName(data.user?.displayName || "");
        setStep("profile");
      } else {
        window.location.assign(next);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e?: React.FormEvent) {
    e?.preventDefault();
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
    <div className="mx-auto max-w-md py-6">
      <h1 className="font-serif text-2xl font-bold text-penn-blue">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">
        No passwords. We email a 6-digit code to your Penn address.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-penn-red/30 bg-penn-red/5 px-3 py-2 text-sm text-penn-red">
          {error}
        </div>
      )}

      {step === "email" && (
        <form onSubmit={requestCode} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Penn email address
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@upenn.edu"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-penn-blue"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-penn-blue px-4 py-3 font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60"
          >
            {loading ? "Sending…" : "Email me a code"}
          </button>
          <p className="text-xs text-ink-muted">
            Any Penn address works (upenn.edu and school subdomains). We never share your email.
          </p>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p className="text-sm text-ink">
            We sent a code to <span className="font-medium">{email}</span>.
          </p>

          {devCode && (
            <div className="rounded-md border border-penn-blue/30 bg-penn-blue-tint px-3 py-2 text-sm text-penn-blue">
              <span className="font-semibold">Dev mode:</span> your code is{" "}
              <span className="tabular font-mono text-base font-bold tracking-widest">{devCode}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                (No real email is sent locally — this is the console mailer.)
              </span>
            </div>
          )}

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-ink">
              6-digit code
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="tabular mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-penn-blue"
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-md bg-penn-blue px-4 py-3 font-semibold text-white hover:bg-penn-blue-hover disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify & sign in"}
          </button>

          <div className="text-xs text-ink-muted">
            <button type="button" onClick={() => requestCode()} className="text-penn-blue hover:underline">
              Send a new code
            </button>
            {waited && (
              <p className="mt-2 rounded-md bg-surface-alt px-3 py-2">
                Didn&rsquo;t get it? Check your spam folder, or request a new code. Still stuck? Email{" "}
                <a href={`mailto:${organizerContact}`} className="text-penn-blue">
                  {organizerContact}
                </a>
                .
              </p>
            )}
          </div>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={saveProfile} className="mt-6 space-y-5">
          <p className="text-sm text-ink">One quick step — this is your first time here.</p>
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
      )}
    </div>
  );
}
