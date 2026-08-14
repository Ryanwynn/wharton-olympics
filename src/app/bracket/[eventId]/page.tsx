import Link from "next/link";
import { getBracket } from "@/lib/bracket";
import { LiveBracket } from "@/components/LiveBracket";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bracket — Wharton Student Olympics" };

export default async function BracketPage({ params }: { params: { eventId: string } }) {
  const bracket = await getBracket(params.eventId, true);
  if (!bracket) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-penn-blue">No bracket yet</h1>
        <p className="mt-2 text-ink-muted">This event doesn&rsquo;t have a tournament bracket.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-penn-blue">
          Back to the scoreboard →
        </Link>
      </div>
    );
  }
  return <LiveBracket eventId={params.eventId} initial={bracket} />;
}
