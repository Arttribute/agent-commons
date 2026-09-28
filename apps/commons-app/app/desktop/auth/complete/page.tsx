"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { AuthShell, AuthTitle, authPrimaryButtonClass } from "@/components/auth/auth-shell";

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
    <AuthShell footer={false} className="text-center">
      {!error && <div className="mx-auto mb-5 h-8 w-8 animate-pulse rounded-full bg-emerald-500/20 ring-8 ring-emerald-500/10" />}
      <AuthTitle description={error || "Your approval was received. Agent Commons is getting your workspace ready."}>
        {error ? "Could not complete sign-in" : "Connecting your account"}
      </AuthTitle>
      {error ? (
        <button
          type="button"
          onClick={() => void window.agentCommonsDesktop?.beginSignIn()}
          className={authPrimaryButtonClass}
        >
          Try again
        </button>
      ) : null}
    </AuthShell>
  );
}
