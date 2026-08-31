"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, LoaderCircle, Radio } from "lucide-react";

export function JoinLiveSession() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6 || loading) return;
    setLoading(true);
    setNotice("");
    const res = await fetch("/api/live-sessions/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleanCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.sessionId) {
      window.location.href = `/live/${data.sessionId}`;
      return;
    }
    setNotice(data.error || "We could not find that session.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5 text-sm font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-950"><FlaskConical className="h-4 w-4" /></span>
          CommonLab
        </Link>
        <section className="rounded-3xl bg-white p-6 text-slate-950 shadow-2xl sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#71E0E7]/25"><Radio className="h-5 w-5" /></span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Live learning</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Join your session</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Enter the six-digit code on the facilitator’s screen. You’ll go straight to the right room.</p>
          <form onSubmit={submit} className="mt-7">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Session code
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Six-digit session code"
                value={formatInput(code)}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123 456"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-center text-3xl font-bold tracking-[0.16em] outline-none focus:border-slate-500"
              />
            </label>
            {notice ? <p className="mt-3 text-sm text-red-600">{notice}</p> : null}
            <button disabled={code.length !== 6 || loading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-40">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Continue
            </button>
          </form>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">Scanning the session QR code skips this step.</p>
      </div>
    </main>
  );
}
function formatInput(code: string) {
  const clean = code.replace(/\D/g, "").slice(0, 6);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}
