import Link from "next/link";
import { Bot } from "lucide-react";
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
    <main className="mx-auto flex h-screen max-w-md flex-col justify-center px-6">
      <Brand />
      <h1 className="mb-2 text-3xl font-bold">Welcome back</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Sign in to continue to your agents.
      </p>
      {registered && (
        <p className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">
          Check your email to verify your Agent Commons account.
        </p>
      )}
      {(error || authJsError) && (
        <p className="mb-4 text-sm text-red-600">
          {error ||
            (authJsError === "Configuration"
              ? "Sign-in could not start because the server auth provider is not configured correctly."
              : "Sign-in failed. Please try again.")}
        </p>
      )}
      <a
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 font-semibold hover:bg-muted"
        href={`${identityUrl}/native/sign-in/google?app=agent-commons&oauth_query=${encodeURIComponent(oauthQuery)}&return_to=${encodeURIComponent(returnTo)}`}
      >
        <GoogleLogo /> Continue with Google
      </a>
      <div className="mb-5 flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form method="post" action={`${identityUrl}/native/sign-in/email`} className="space-y-4">
        <input type="hidden" name="app" value="agent-commons" />
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="block text-sm font-medium">
          Email
          <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="w-full rounded-md bg-black px-4 py-3 font-semibold text-white">
          Sign in
        </button>
      </form>
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-center font-medium">Create an account</summary>
        <form method="post" action={`${identityUrl}/native/sign-up/email`} className="mt-4 space-y-4">
          <input type="hidden" name="app" value="agent-commons" />
          <input type="hidden" name="oauth_query" value={oauthQuery} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input className="w-full rounded-md border bg-background px-3 py-2" name="name" placeholder="Your name" autoComplete="name" required />
          <input className="w-full rounded-md border bg-background px-3 py-2" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <input className="w-full rounded-md border bg-background px-3 py-2" name="password" type="password" minLength={8} placeholder="At least 8 characters" autoComplete="new-password" required />
          <button className="w-full rounded-md border px-4 py-3 font-semibold">Create account</button>
        </form>
      </details>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        One secure account works across Agent Commons, CommonLab, and CommonOS.
      </p>
    </main>
  );
}

function Brand() {
  return (
    <Link href="/" className="mb-10 flex items-center gap-2 font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white"><Bot className="h-4 w-4" /></span>
      Agent Commons
    </Link>
  );
}
