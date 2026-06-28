import Link from "next/link";
import { FlaskConical, Sparkles, Trophy, Zap } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { GoogleLogo } from "@/components/auth/google-logo";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";
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
  const returnTo = `${appUrl}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  if (!oauthQuery) {
    redirect(`/api/auth/native/start?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  return (
    <Shell>
      {registered && (
        <div className="mb-5 rounded-lg border border-lime-200 bg-lime-50 px-4 py-3 text-center text-sm text-lime-800">
          Check your email to verify your CommonLab account.
        </div>
      )}
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="mb-8 text-center text-sm text-slate-500">
        Pick up your streak, badges, and builder work.
      </p>
      {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}
      <a
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
        href={`${identityUrl}/native/sign-in/google?app=commonlabs&oauth_query=${encodeURIComponent(oauthQuery)}&return_to=${encodeURIComponent(returnTo)}`}
      >
        <GoogleLogo /> Continue with Google
      </a>
      <Divider />
      <form method="post" action={`${identityUrl}/native/sign-in/email`} className="space-y-4">
        <input type="hidden" name="app" value="commonlabs" />
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <input type="hidden" name="return_to" value={returnTo} />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <button className="w-full rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
          Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account?{" "}
        <Link
          className="font-bold text-slate-900"
          href={`/auth/signup?oauth_query=${encodeURIComponent(oauthQuery)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
        >
          Sign up
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
            Daily AI fluency, without the dashboard fog.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
            Jump back into focused lessons, quick skill wins, and practical agent labs.
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
        {children}
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

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
      {label}
      <input
        {...input}
        required
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
      />
    </label>
  );
}

function Divider() {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">or</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
