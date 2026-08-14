import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getEventForScoring } from "@/lib/adminQueries";
import { getBracket } from "@/lib/bracket";
import { ScoreEntry } from "@/components/ScoreEntry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Score entry — Wharton Student Olympics" };

export default async function ScorePage({ params }: { params: { eventId: string } }) {
  const user = await getOptionalUser();
  if (!user) redirect(`/signin?next=/score/${params.eventId}`);

  // Server-side authorization, re-checked here and again on every write route (§3).
  let allowed = user.isAdmin;
  if (!allowed && user.isScorekeeper) {
    const assigned = await queryOne(`SELECT 1 FROM scorekeeper_events WHERE user_id = $1 AND event_id = $2`, [user.id, params.eventId]);
    allowed = Boolean(assigned);
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-penn-blue">Not authorized</h1>
        <p className="mt-2 text-ink-muted">You&rsquo;re not assigned to score this event.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-penn-blue">
          Back to the scoreboard →
        </Link>
      </div>
    );
  }

  const event = await getEventForScoring(params.eventId);
  if (!event) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-ink-muted">Event not found.</div>;
  }
  const bracket = event.hasBracket ? await getBracket(params.eventId, false) : null;
  return <ScoreEntry initial={event} initialBracket={bracket} />;
}
