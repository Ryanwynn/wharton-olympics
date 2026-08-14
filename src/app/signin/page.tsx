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
  if (user) {
    // Already signed in — skip straight to the intended destination.
    redirect(searchParams.next || "/me");
  }
  const cohorts = await getCohorts();
  return (
    <Suspense>
      <SignInFlow cohorts={cohorts} organizerContact={env.organizerContact} />
    </Suspense>
  );
}
