import { getOptionalUser } from "@/lib/auth";
import { getBrowseEvents } from "@/lib/queries";
import { EventsBrowser } from "@/components/EventsBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events — Wharton Student Olympics" };

export default async function EventsPage() {
  const user = await getOptionalUser();
  const events = await getBrowseEvents(user?.id ?? null);
  return <EventsBrowser initialEvents={events} signedIn={Boolean(user)} />;
}
