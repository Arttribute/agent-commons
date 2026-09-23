"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function DesktopAuthCompletePage() {
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const complete = async () => {
      const identitySessionToken = new URLSearchParams(
        window.location.hash.slice(1),
      ).get("token");
      window.history.replaceState(null, "", "/desktop/auth/complete");
      if (!identitySessionToken) {
        setError("The browser approval did not return a valid desktop grant.");
        return;
      }
      const result = await signIn("desktop-device", {
        identitySessionToken,
        redirect: false,
        callbackUrl: "/studio/agents",
      });
      if (!active) return;
      if (result?.error) {
        setError("The desktop grant could not be verified. Please try again.");
        return;
      }
      window.location.replace(result?.url ?? "/studio/agents");
    };
    void complete();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] px-6 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto h-9 w-9 animate-pulse rounded-full bg-emerald-500/20 ring-8 ring-emerald-500/10" />
        <h1 className="mt-7 text-2xl font-semibold tracking-tight">
          {error ? "Could not complete sign-in" : "Connecting your account…"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
          {error || "Your browser approval was received. Agent Commons is preparing your workspace."}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => void window.agentCommonsDesktop?.beginSignIn()}
            className="mt-6 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-medium text-white dark:bg-stone-50 dark:text-stone-950"
          >
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}
