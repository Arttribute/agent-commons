"use client";

import { useEffect, useState } from "react";
import { WorkspaceModeSwitch } from "@/components/layout/workspace-mode-switch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { AuthShell, AuthTitle, authPrimaryButtonClass } from "@/components/auth/auth-shell";

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
    <AuthShell
      footer={false}
      corner={desktopAvailable ? (
        <WorkspaceModeSwitch mode={mode} onCloud={() => undefined} onLocal={() => void setMode("private-local")} />
      ) : undefined}
    >
      <AuthTitle
        description={error
          ? error
          : "We opened your browser. Approve this app there and this window continues on its own."}
      >
        {error ? "Sign-in needs your attention" : "Finish signing in in your browser"}
      </AuthTitle>
      {!error && code ? (
        <div className="rounded-[10px] bg-stone-100 px-4 py-3 text-center">
          <p className="text-[11px] text-stone-500">Check that your browser shows this code</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em]">{code}</p>
        </div>
      ) : null}
      {error ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying || !desktopAvailable}
          className={`mt-2 ${authPrimaryButtonClass}`}
        >
          {retrying ? "Opening browser…" : "Try again"}
        </button>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-sm text-stone-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Waiting for approval
        </p>
      )}
      {desktopAvailable && !error && (
        <p className="mt-5 border-t border-stone-100 pt-4 text-xs leading-5 text-stone-400">
          Prefer not to sign in? Switch to Local in the corner. Local keeps everything on this computer.
        </p>
      )}
    </AuthShell>
  );
}
