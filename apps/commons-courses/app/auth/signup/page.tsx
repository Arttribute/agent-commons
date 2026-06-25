import Link from "next/link";
import { FlaskConical } from "lucide-react";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";
  const authorizeUrl =
    typeof params.authorize_url === "string" ? params.authorize_url : "";
  const identityUrl =
    process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, "") ??
    "https://auth.agentcommons.io";
  const appUrl =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "https://labs.agentcommons.io";
  const returnTo = `${appUrl}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  if (!authorizeUrl) {
    return (
      <form method="post" action="/api/auth/native/start">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <script dangerouslySetInnerHTML={{ __html: "document.forms[0].submit()" }} />
      </form>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900">CommonLab</span>
        </Link>
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mb-8 text-center text-sm text-slate-500">Start learning with CommonLab</p>
        <a
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          href={`${identityUrl}/native/sign-in/google?app=commonlabs&authorize_url=${encodeURIComponent(authorizeUrl)}&return_to=${encodeURIComponent(returnTo)}`}
        >
          <span className="font-bold text-blue-600">G</span> Continue with Google
        </a>
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" /><span className="text-xs font-bold uppercase text-slate-400">or</span><span className="h-px flex-1 bg-slate-200" />
        </div>
        <form method="post" action={`${identityUrl}/native/sign-up/email`} className="space-y-4">
          <input type="hidden" name="app" value="commonlabs" />
          <input type="hidden" name="authorize_url" value={authorizeUrl} />
          <input type="hidden" name="return_to" value={returnTo} />
          <Input label="Name" name="name" autoComplete="name" />
          <Input label="Email" name="email" type="email" autoComplete="email" />
          <Input label="Password" name="password" type="password" minLength={8} autoComplete="new-password" />
          <button className="w-full rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Create account</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link className="font-bold text-slate-900" href={`/auth/signin?authorize_url=${encodeURIComponent(authorizeUrl)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
      {label}
      <input {...input} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
    </label>
  );
}
