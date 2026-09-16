import { getStandings, getSchedule, getLastUpdated, getFoodTrucks } from "@/lib/queries";
import { Scoreboard } from "@/components/Scoreboard";

// Rendered per request; the live-updating parts poll the CDN-cached JSON endpoints.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [standings, schedule, lastUpdated, foodTrucks] = await Promise.all([
    getStandings(),
    getSchedule(),
    getLastUpdated(),
    getFoodTrucks(),
  ]);
  return <Scoreboard initial={{ standings, schedule, lastUpdated, foodTrucks }} />;
}
