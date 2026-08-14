import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOptionalUser } from "@/lib/auth";
import { getCohorts } from "@/lib/queries";
import { env } from "@/lib/env";
import { SignInFlow } from "@/components/SignInFlow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Wharton Student Olympics" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await getOptionalUser();
  // Signed in AND profile complete → straight to the destination. Signed in but no
  // cluster yet → fall through so they can finish the profile step.
  if (user && user.cohortId) {
    redirect(searchParams.next || "/me");
  }
  const cohorts = await getCohorts();
  return (
    <Suspense>
      <SignInFlow
        cohorts={cohorts}
        organizerContact={env.organizerContact}
        resumeProfile={user ? { displayName: user.displayName } : null}
      />
    </Suspense>
  );
}
