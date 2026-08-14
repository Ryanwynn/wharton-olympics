export const metadata = { title: "Privacy note — Wharton Student Olympics" };

export default function PrivacyPage() {
  return (
    <article className="prose-sm mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Privacy note</h1>
      <p className="mt-4 text-ink">
        This is a student-run event tool. Here is exactly what it collects and why (§13).
      </p>

      <h2 className="mt-6 text-lg font-semibold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
        <li>Your Penn email address, used only to verify you and send sign-in codes.</li>
        <li>A display name and your cluster, shown to organizers and — as first name + last initial — on public results.</li>
        <li>Your event registrations, teams, and any scores recorded for you.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">What we never do</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
        <li>No third-party analytics, advertising pixels, or trackers.</li>
        <li>No full email addresses on any public page.</li>
        <li>No selling or sharing of data. Registration data is treated as confidential.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Retention</h2>
      <p className="mt-2 text-ink">
        Sign-in codes and sessions are purged after 30 days. After the event you can ask an organizer
        to delete your data entirely. Email{" "}
        <a href="mailto:olympics@wharton.upenn.edu">olympics@wharton.upenn.edu</a>.
      </p>

      <p className="mt-6 text-sm text-ink-muted">
        A student organization at the University of Pennsylvania. Not affiliated with or endorsed by
        the Wharton School or the University of Pennsylvania.
      </p>
    </article>
  );
}
