import Link from "next/link";
import { FlaskConical, Loader2 } from "lucide-react";

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
    return (
      <Shell>
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mb-8 text-center text-sm text-slate-500">Sign in and continue learning</p>
        <form method="post" action="/api/auth/native/start">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button className="flex w-full items-center justify-center rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing sign in…
          </button>
        </form>
        <script dangerouslySetInnerHTML={{ __html: "document.forms[0].submit()" }} />
      </Shell>
    );
  }

  return (
    <Shell>
      {registered && (
        <div className="mb-5 rounded-lg border border-lime-200 bg-lime-50 px-4 py-3 text-center text-sm text-lime-800">
          Check your email to verify your CommonLab account.
        </div>
      )}
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="mb-8 text-center text-sm text-slate-500">Sign in and continue learning</p>
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
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">CommonLab</span>
        </Link>
        {children}
      </div>
    </main>
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

function GoogleLogo() {
  return <span className="font-bold text-blue-600">G</span>;
}
