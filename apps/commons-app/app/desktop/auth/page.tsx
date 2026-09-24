"use client";

import { useEffect, useState } from "react";
import { WorkspaceModeSwitch } from "@/components/layout/workspace-mode-switch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

export default function DesktopAuthPage() {
  const { mode, setMode } = useWorkspaceMode();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get("code") ?? "");
    setError(params.get("error") ?? "");
    setDesktopAvailable(Boolean(window.agentCommonsDesktop));
  }, []);

  const retry = async () => {
    setRetrying(true);
    setError("");
    try {
      await window.agentCommonsDesktop?.beginSignIn();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not restart sign-in.",
      );
      setRetrying(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] px-6 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      {desktopAvailable && <div className="absolute top-5 left-1/2 -translate-x-1/2"><WorkspaceModeSwitch mode={mode} onCloud={() => undefined} onLocal={() => void setMode("private-local")} /></div>}
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
          Agent Commons Desktop
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {error ? "Sign-in needs your attention" : "Finish signing in on the web"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-300">
          {error
            ? error
            : "We opened your browser, where your Commons account may already be signed in. Approve this desktop app there and this window will continue automatically."}
        </p>
        {!error && code ? (
          <div className="mt-7 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 dark:border-stone-700 dark:bg-stone-800">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              One-time code
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.16em]">
              {code}
            </p>
          </div>
        ) : null}
        <div className="mt-7 flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-sm text-stone-600 dark:text-stone-300">
            {error ? "Authorization was not completed" : "Waiting for browser approval…"}
          </span>
        </div>
        {error ? (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying || !desktopAvailable}
            className="mt-7 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-50 dark:text-stone-950"
          >
            {retrying ? "Opening browser…" : "Try again"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
