"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2 } from "lucide-react";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-colors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            Agent Commons Courses
          </span>
        </Link>
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">
          Reset your password
        </h1>
        <p className="mb-8 text-center text-sm text-slate-500">
          Enter your email and we will send a secure reset link.
        </p>
        {sent ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-700">
            If an account exists, a password reset email is on its way.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reset link
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/auth/signin" className="font-bold text-slate-900">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
