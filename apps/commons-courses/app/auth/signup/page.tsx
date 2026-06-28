import Link from "next/link";
import { FlaskConical, Sparkles, Trophy, Zap } from "lucide-react";
import { SignUpClient } from "./signup-client";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";
  const oauthQuery =
    typeof params.oauth_query === "string" ? params.oauth_query : "";
  const identityUrl =
    process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, "") ??
    "https://auth.agentcommons.io";
  const appUrl =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "https://commonlab.agentcommons.io";

  return (
    <main className="grid min-h-screen bg-white text-slate-950 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="hidden border-r border-slate-200 bg-slate-50 px-10 py-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">CommonLab</span>
        </Link>
        <div className="max-w-md">
          <div className="mb-8 inline-flex rounded-xl bg-[#B8F56D] p-3">
            <Sparkles className="h-6 w-6 text-slate-950" />
          </div>
          <h2 className="text-4xl font-semibold tracking-tight">
            Build practical AI instincts one tiny win at a time.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
            Start with focused lessons, daily badges, and safe agent experiments.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <AuthStat icon={Zap} label="Quick wins" value="10 min" />
          <AuthStat icon={Trophy} label="Badges" value="Daily" />
          <AuthStat icon={Sparkles} label="Labs" value="Hands-on" />
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
              <FlaskConical className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-900">CommonLab</span>
          </Link>
          <SignUpClient
            identityUrl={identityUrl}
            appUrl={appUrl}
            callbackUrl={callbackUrl}
            initialOauthQuery={oauthQuery}
          />
        </div>
      </section>
    </main>
  );
}

function AuthStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <Icon className="mb-3 h-4 w-4 text-slate-500" />
      <p className="text-sm font-black text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
