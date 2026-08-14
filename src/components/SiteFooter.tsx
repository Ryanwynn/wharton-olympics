import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-alt">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-ink-muted sm:px-6">
        <p className="font-medium text-ink">Wharton Student Olympics</p>
        {/* Required disclaimer (§12.3). No Wharton logo or Penn shield is used. */}
        <p className="mt-1">A student organization at the University of Pennsylvania.</p>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed">
          Not affiliated with, endorsed by, or sponsored by the Wharton School or the University of
          Pennsylvania. Cluster mascots shown are generic placeholders, not official cluster seals.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <Link href="/privacy">Privacy note</Link>
          <a href="mailto:olympics@wharton.upenn.edu">Contact organizers</a>
        </div>
      </div>
    </footer>
  );
}
