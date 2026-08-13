"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { LoaderCircle } from "lucide-react";
import { GoogleLogo } from "@/components/auth/google-logo";

export function LiveJoinAuth({ callbackUrl, googleAvailable }: { callbackUrl: string; googleAvailable: boolean }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  async function continueWithGoogle() {
    if (starting) return;
    setStarting(true); setError("");
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Google sign-in could not start. Please try again.");
      setStarting(false);
    }
  }
  return <div className="mt-7 grid gap-2">
    {googleAvailable ? <button onClick={() => void continueWithGoogle()} disabled={starting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GoogleLogo />} {starting ? "Opening Google…" : "Continue with Google"}</button> : null}
    <Link href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">Create account with email</Link>
    <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="px-5 py-2 text-center text-xs font-bold text-slate-500 hover:text-slate-900">Use another sign-in method</Link>
    {error ? <p className="mt-2 text-center text-xs text-red-600">{error}</p> : null}
  </div>;
}
