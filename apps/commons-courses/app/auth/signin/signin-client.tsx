"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { GoogleLogo } from "@/components/auth/google-logo";

type SignInClientProps = {
  identityUrl: string;
  appUrl: string;
  callbackUrl: string;
  initialOauthQuery: string;
  error: string;
  registered: boolean;
};

export function SignInClient({
  identityUrl,
  appUrl,
  callbackUrl,
  initialOauthQuery,
  error,
  registered,
}: SignInClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const [oauthQuery, setOauthQuery] = useState(initialOauthQuery);
  const [prepareError, setPrepareError] = useState("");
  const preparing = !oauthQuery && !prepareError;
  const returnTo = useMemo(
    () => `${appUrl}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    [appUrl, callbackUrl]
  );

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [callbackUrl, router, status]);

  useEffect(() => {
    if (oauthQuery) return;
    let cancelled = false;

    async function prepare() {
      try {
        const res = await fetch(
          `/api/auth/native/start?format=json&callbackUrl=${encodeURIComponent(callbackUrl)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          oauthQuery?: string;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && data.oauthQuery) {
          setOauthQuery(data.oauthQuery);
        } else {
          setPrepareError(data.error || "Could not prepare sign-in.");
        }
      } catch {
        if (!cancelled) setPrepareError("Could not prepare sign-in.");
      }
    }

    prepare();
    return () => {
      cancelled = true;
    };
  }, [callbackUrl, oauthQuery]);

  return (
    <>
      {registered && (
        <div className="mb-5 rounded-lg border border-lime-200 bg-lime-50 px-4 py-3 text-center text-sm text-lime-800">
          Check your email to verify your CommonLab account.
        </div>
      )}
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="mb-8 text-center text-sm text-slate-500">
        Sign in to continue.
      </p>
      {(error || prepareError) && (
        <p className="mb-4 text-center text-sm text-red-600">
          {error || prepareError}
        </p>
      )}
      <a
        aria-disabled={preparing}
        className={`mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 ${
          preparing ? "pointer-events-none opacity-60" : ""
        }`}
        href={
          oauthQuery
            ? `${identityUrl}/native/sign-in/google?app=commonlabs&oauth_query=${encodeURIComponent(oauthQuery)}&return_to=${encodeURIComponent(returnTo)}`
            : "#"
        }
      >
        <GoogleLogo /> {preparing ? "Preparing sign-in..." : "Continue with Google"}
      </a>
      <Divider />
      <form method="post" action={`${identityUrl}/native/sign-in/email`} className="space-y-4">
        <input type="hidden" name="app" value="commonlabs" />
        <input type="hidden" name="oauth_query" value={oauthQuery} />
        <input type="hidden" name="return_to" value={returnTo} />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <button
          disabled={!oauthQuery}
          className="w-full rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300"
        >
          {preparing ? "Preparing..." : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account?{" "}
        <Link
          className="font-bold text-slate-900"
          href={`/auth/signup${oauthQuery ? `?oauth_query=${encodeURIComponent(oauthQuery)}&` : "?"}callbackUrl=${encodeURIComponent(callbackUrl)}`}
        >
          Sign up
        </Link>
      </p>
    </>
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
