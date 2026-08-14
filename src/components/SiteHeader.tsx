"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderUser {
  displayName: string;
  isAdmin: boolean;
  isScorekeeper: boolean;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  // The scorekeeper surface is deliberately chrome-free (§6.5) — hide the header there.
  if (pathname?.startsWith("/score/")) return null;

  const nav = [
    { href: "/", label: "Schedule" },
    { href: "/events", label: "Events" },
    ...(user ? [{ href: "/me", label: "My events" }] : []),
    ...(user?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex flex-col leading-none no-underline">
          {/* Typographic wordmark only — no Wharton logo / Penn shield (§12.3). */}
          <span className="font-serif text-lg font-bold text-penn-blue sm:text-xl">
            Wharton Student Olympics
          </span>
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">2026 · four clusters, one day</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-2 no-underline transition-colors sm:px-3 ${
                  active
                    ? "bg-penn-blue-tint font-semibold text-penn-blue"
                    : "text-ink hover:bg-surface-alt"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {user ? (
            <span className="ml-1 hidden items-center gap-2 border-l border-border pl-3 sm:flex">
              <span className="max-w-[9rem] truncate text-ink-muted" title={user.displayName}>
                {user.displayName}
              </span>
              <form action="/api/auth/signout" method="post">
                <button className="rounded-md px-2 py-1 text-penn-blue hover:underline" type="submit">
                  Sign out
                </button>
              </form>
            </span>
          ) : (
            <Link
              href="/signin"
              className="ml-1 rounded-md bg-penn-blue px-3 py-2 font-semibold text-white no-underline hover:bg-penn-blue-hover"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
