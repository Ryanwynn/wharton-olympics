import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth";
import { listAdminEvents, getAuditLog } from "@/lib/adminQueries";
import { getCohorts } from "@/lib/queries";
import { AdminConsole } from "@/components/AdminConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Wharton Student Olympics" };

export default async function AdminPage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin?next=/admin");
  if (!user.isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-penn-blue">Admins only</h1>
        <p className="mt-2 text-ink-muted">This area is limited to organizers.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-penn-blue">Back to the scoreboard →</Link>
      </div>
    );
  }
  const [events, cohorts, audit] = await Promise.all([listAdminEvents(), getCohorts(), getAuditLog()]);
  return <AdminConsole initialEvents={events} cohorts={cohorts} initialAudit={audit} />;
}
