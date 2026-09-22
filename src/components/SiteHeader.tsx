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
    { href: "/", label: "Live Schedule and Events" },
    { href: "/full-schedule", label: "Full Day Schedule" },
    { href: "/events", label: "Event Sign Up" },
    ...(user ? [{ href: "/me", label: "My events" }] : []),
    ...(user?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b-2 border-penn-red bg-penn-blue text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex flex-col leading-none text-white no-underline">
          {/* Typographic wordmark only — no Wharton logo / Penn shield (§12.3). */}
          <span className="font-serif text-lg font-bold text-white sm:text-xl">Wharton Cluster Olympics</span>
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
                  active ? "bg-white/20 font-semibold text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {user ? (
            <span className="ml-1 hidden items-center gap-2 border-l border-white/25 pl-3 sm:flex">
              <span className="max-w-[9rem] truncate text-white/80" title={user.displayName}>
                {user.displayName}
              </span>
              <form action="/api/auth/signout" method="post">
                <button className="rounded-md px-2 py-1 text-white/85 hover:text-white hover:underline" type="submit">
                  Sign out
                </button>
              </form>
            </span>
          ) : (
            <Link
              href="/signin"
              className="ml-1 rounded-md bg-penn-red px-4 py-2 font-bold text-white no-underline shadow-sm ring-1 ring-white/25 transition-colors hover:bg-penn-red-hover sm:px-5"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
