import { getStandings, getSchedule, getLastUpdated, getFoodTrucks, getWeatherNotice } from "@/lib/queries";
import { Scoreboard } from "@/components/Scoreboard";

// Rendered per request; the live-updating parts poll the CDN-cached JSON endpoints.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [standings, schedule, lastUpdated, foodTrucks, notice] = await Promise.all([
    getStandings(),
    getSchedule(),
    getLastUpdated(),
    getFoodTrucks(),
    getWeatherNotice(),
  ]);
  return <Scoreboard initial={{ standings, schedule, lastUpdated, foodTrucks, notice }} />;
}
