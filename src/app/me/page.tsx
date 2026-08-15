import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { getMyAgenda, getCohorts } from "@/lib/queries";
import { MyEvents } from "@/components/MyEvents";

export const dynamic = "force-dynamic";
export const metadata = { title: "My events — Wharton Student Olympics" };

export default async function MePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin?next=/me");
  const [items, cohorts] = await Promise.all([getMyAgenda(user.id), getCohorts()]);
  return <MyEvents items={items} cohorts={cohorts} currentCohortId={user.cohortId} />;
}
