import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOptionalUser } from "@/lib/auth";
import { getCohorts } from "@/lib/queries";
import { env } from "@/lib/env";
import { googleConfigured } from "@/lib/oauth";
import { SignInFlow } from "@/components/SignInFlow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Wharton Student Olympics" };

export default async function SignInPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getOptionalUser();
  // Signed in AND profile complete → straight to the destination. Signed in but no
  // cluster yet → fall through so they can finish the profile step.
  if (user && user.cohortId) {
    redirect(searchParams.next || "/me");
  }
  const cohorts = await getCohorts();
  const domainHint = env.allowedEmailDomains.slice(0, 2).map((d) => `@${d}`).join(" / ");

  return (
    <Suspense>
      <SignInFlow
        cohorts={cohorts}
        devLogin={!googleConfigured() && !env.isProd}
        domainHint={domainHint}
        resumeProfile={user ? { displayName: user.displayName } : null}
      />
    </Suspense>
  );
}
