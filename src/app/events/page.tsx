import { getOptionalUser } from "@/lib/auth";
import { getBrowseEvents, getCohorts } from "@/lib/queries";
import { EventsBrowser } from "@/components/EventsBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events — Wharton Cluster Olympics" };

export default async function EventsPage() {
  const user = await getOptionalUser();
  const [events, cohorts] = await Promise.all([getBrowseEvents(user?.id ?? null), getCohorts()]);
  return <EventsBrowser initialEvents={events} cohorts={cohorts} signedIn={Boolean(user)} />;
}
