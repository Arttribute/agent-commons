import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { safeAuthCallback } from "@/lib/auth-callback";
import { SignInClient } from "./signin-client";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl = safeAuthCallback(params.callbackUrl);
  const oauthQuery =
    typeof params.oauth_query === "string" ? params.oauth_query : "";
  const error = typeof params.authError === "string" ? params.authError : "";
  const registered = params.registered === "1";
  const identityUrl =
    process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, "") ??
    "https://auth.agentcommons.io";
  const appUrl =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "https://commonlab.agentcommons.io";

  return (
    <Shell>
      <SignInClient
        identityUrl={identityUrl}
        appUrl={appUrl}
        callbackUrl={callbackUrl}
        initialOauthQuery={oauthQuery}
        error={error}
        registered={registered}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-slate-950">
      <section className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">CommonLab</span>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </section>
    </main>
  );
}
