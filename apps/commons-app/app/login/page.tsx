import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  AuthShell,
  AuthTitle,
  authInputClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from "@/components/auth/auth-shell";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleLogo } from "@/components/auth/google-logo";
import { safeAuthCallback } from "@/lib/auth-callback";
import { loginOutcome, restartSignInUrl } from "@/lib/login-flow";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl = safeAuthCallback(params.callbackUrl);
  const oauthQuery =
    typeof params.oauth_query === "string" ? params.oauth_query : "";
  const { authError: error, registered, startFailed } = loginOutcome(params);
  const identityUrl =
    process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, "") ??
    "https://auth.agentcommons.io";
  const returnTo = `${process.env.AUTH_URL ?? "https://www.agentcommons.io"}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  if (!oauthQuery && !startFailed) redirect(restartSignInUrl(callbackUrl, params));

  if (!oauthQuery) {
    return (
      <AuthShell>
        <AuthTitle description="Sign-in could not start. Please try again.">Sign in</AuthTitle>
        <p className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
          {error || "Sign-in could not start."}
        </p>
        <Link className={authPrimaryButtonClass} href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
          Try again
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle description="Use your Commons account. It works across every Commons app.">Sign in</AuthTitle>
      {registered && (
        <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          Check your email to verify your account.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <a
        className={authSecondaryButtonClass}
        href={`${identityUrl}/native/sign-in/google?app=agent-commons&oauth_query=${encodeURIComponent(oauthQuery)}&return_to=${encodeURIComponent(returnTo)}`}
      >
        <GoogleLogo /> Continue with Google
      </a>
      <div className="my-4 flex items-center gap-3 text-xs text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> or with email <span className="h-px flex-1 bg-stone-200" />
      </div>
      <form method="post" action={`${identityUrl}/native/sign-in/email`} className="space-y-3">
        <input type="hidden" name="app" value="agent-commons" />
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="block space-y-1.5 text-[13px] font-medium text-stone-700">
          <span>Email</span>
          <input className={authInputClass} name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block space-y-1.5 text-[13px] font-medium text-stone-700">
          <span>Password</span>
          <input className={authInputClass} name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className={authPrimaryButtonClass}>Sign in</button>
      </form>
      <p className="mt-3 text-center text-sm">
        <a
          className="text-stone-600 underline-offset-2 transition-colors hover:text-stone-950 hover:underline"
          href={`${identityUrl}/forgot-password?app=agent-commons`}
        >
          Forgot password?
        </a>
      </p>
      <details className="group mt-5 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-stone-600 transition-colors hover:text-stone-950">
          New here? Create an account
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <form method="post" action={`${identityUrl}/native/sign-up/email`} className="mt-4 space-y-3">
          <input type="hidden" name="app" value="agent-commons" />
          <input type="hidden" name="oauth_query" value={oauthQuery} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input className={authInputClass} name="name" placeholder="Your name" autoComplete="name" required />
          <input className={authInputClass} name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <input className={authInputClass} name="password" type="password" minLength={8} placeholder="At least 8 characters" autoComplete="new-password" required />
          <button type="submit" className={authSecondaryButtonClass}>Create account · 500 credits included</button>
        </form>
      </details>
      <p className="mt-5 text-center text-xs leading-5 text-stone-400">
        By continuing, you agree to the <Link className="underline underline-offset-2 hover:text-stone-700" href="/terms">terms</Link> and <Link className="underline underline-offset-2 hover:text-stone-700" href="/privacy">privacy policy</Link>.
      </p>
    </AuthShell>
  );
}
