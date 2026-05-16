"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { BookOpen, Loader2 } from "lucide-react";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-colors";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const verified = searchParams.get("verified");
  const reset = searchParams.get("reset");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid password, or your email still needs verification.");
    } else {
      router.push(callbackUrl);
    }
  };

  const handleGoogle = () => {
    signIn("google", { callbackUrl });
  };

  const resendVerification = async () => {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setNotice("");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, callbackUrl }),
    });
    setNotice("If that account needs verification, a new email is on its way.");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 justify-center mb-10"
        >
          <div
            className="h-7 w-7 rounded flex items-center justify-center"
            style={{ backgroundColor: "#0a0a0a" }}
          >
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Agent Commons{" "}
            <span className="font-bold text-slate-900">Courses</span>
          </span>
        </Link>

        {registered && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 text-center">
            Account created. Check your email to verify your account, then sign
            in to continue.
          </div>
        )}
        {verified === "1" && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-lime-50 border border-lime-200 text-sm text-lime-800 text-center">
            Email verified. Sign in to continue.
          </div>
        )}
        {verified === "0" && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-center">
            Verification link is invalid or expired.
          </div>
        )}
        {reset === "1" && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-lime-50 border border-lime-200 text-sm text-lime-800 text-center">
            Password updated. Sign in to continue.
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-900 mb-1 text-center">
          Welcome back
        </h1>
        <p className="text-sm text-slate-500 text-center mb-8">
          Sign in and continue to your course
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Or
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 tracking-wide uppercase">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 tracking-wide uppercase">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          {notice && (
            <p className="text-sm text-lime-700 text-center">{notice}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-60 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#0a0a0a" }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
        <button
          type="button"
          onClick={resendVerification}
          className="mt-3 w-full text-center text-sm font-bold text-slate-900"
        >
          Resend verification email
        </button>

        <p className="text-center text-sm text-slate-500 mt-6">
          No account?{" "}
          <Link
            href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-bold text-slate-900"
          >
            Sign up
          </Link>
        </p>
        <p className="text-center text-sm text-slate-500 mt-3">
          <Link href="/auth/forgot-password" className="font-bold text-slate-900">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
