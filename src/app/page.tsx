import { getStandings, getSchedule, getLastUpdated } from "@/lib/queries";
import { Scoreboard } from "@/components/Scoreboard";

// Rendered per request; the live-updating parts poll the CDN-cached JSON endpoints.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [standings, schedule, lastUpdated] = await Promise.all([
    getStandings(),
    getSchedule(),
    getLastUpdated(),
  ]);
  return <Scoreboard initial={{ standings, schedule, lastUpdated }} />;
}
