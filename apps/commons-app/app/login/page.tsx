import Link from "next/link";
import Image from "next/image";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleLogo } from "@/components/auth/google-logo";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/agents";
  const oauthQuery =
    typeof params.oauth_query === "string" ? params.oauth_query : "";
  const error = typeof params.authError === "string" ? params.authError : "";
  const authJsError = typeof params.error === "string" ? params.error : "";
  const registered = params.registered === "1";
  const identityUrl =
    process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, "") ??
    "https://auth.agentcommons.io";
  const returnTo = `${process.env.AUTH_URL ?? "https://www.agentcommons.io"}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  if (!oauthQuery) {
    redirect(`/api/auth/native/start?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <main className="relative h-screen overflow-y-auto bg-stone-50 text-stone-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-40 h-[32rem] w-[32rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute -bottom-48 -right-28 h-[32rem] w-[32rem] rounded-full bg-cyan-200/25 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6">
        <Brand />
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_24px_65px_rgba(28,25,23,0.08)] sm:p-8">
          <div className="mb-7">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-stone-950 text-white">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Sign in to continue to your agents and workspace.
            </p>
          </div>
      {registered && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          Check your email to verify your Agent Commons account.
        </p>
      )}
      {(error || authJsError) && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
          {error ||
            (authJsError === "Configuration"
              ? "Sign-in could not start because the server auth provider is not configured correctly."
              : "Sign-in failed. Please try again.")}
        </p>
      )}
      <a
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold transition-colors hover:bg-stone-50"
        href={`${identityUrl}/native/sign-in/google?app=agent-commons&oauth_query=${encodeURIComponent(oauthQuery)}&return_to=${encodeURIComponent(returnTo)}`}
      >
        <GoogleLogo /> Continue with Google
      </a>
      <div className="mb-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> or <span className="h-px flex-1 bg-stone-200" />
      </div>
      <form method="post" action={`${identityUrl}/native/sign-in/email`} className="space-y-4">
        <input type="hidden" name="app" value="agent-commons" />
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="block text-sm font-medium text-stone-700">
          Email
          <input className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-stone-950 outline-none transition focus:border-stone-500 focus:ring-4 focus:ring-stone-100" name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Password
          <input className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-stone-950 outline-none transition focus:border-stone-500 focus:ring-4 focus:ring-stone-100" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="w-full rounded-lg bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-700">
          Sign in
        </button>
      </form>
      <details className="group mt-5 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 font-medium text-stone-600 transition-colors hover:text-stone-950">
          Create an account · 500 credits included
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <form method="post" action={`${identityUrl}/native/sign-up/email`} className="mt-4 space-y-4">
          <input type="hidden" name="app" value="agent-commons" />
          <input type="hidden" name="oauth_query" value={oauthQuery} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-stone-500 focus:ring-4 focus:ring-stone-100" name="name" placeholder="Your name" autoComplete="name" required />
          <input className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-stone-500 focus:ring-4 focus:ring-stone-100" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <input className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-stone-500 focus:ring-4 focus:ring-stone-100" name="password" type="password" minLength={8} placeholder="At least 8 characters" autoComplete="new-password" required />
          <button type="submit" className="w-full rounded-lg border border-stone-300 px-4 py-3 font-semibold transition-colors hover:bg-stone-50">Create account</button>
        </form>
      </details>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-stone-500">
          One secure account works across Agent Commons, CommonLab, and CommonOS.
          <br />
          By continuing, you agree to our <Link className="underline underline-offset-2 hover:text-stone-800" href="/terms">terms</Link> and <Link className="underline underline-offset-2 hover:text-stone-800" href="/privacy">privacy policy</Link>.
        </p>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <Link href="/" className="mb-7 flex items-center justify-center" aria-label="Agent Commons home">
      <Image
        src="/logo.jpg"
        alt="Agent Commons"
        width={116}
        height={53}
        className="h-10 w-auto mix-blend-multiply"
        priority
      />
    </Link>
  );
}
