"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { AuthShell, AuthTitle, authPrimaryButtonClass } from "@/components/auth/auth-shell";
import { safeInternalReturnUrl } from "@/lib/safe-return-url";

function OAuthSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);
  const [storedReturnUrl, setStoredReturnUrl] = useState<string | null>(null);
  const [storedProviderLabel, setStoredProviderLabel] = useState<string | null>(
    null,
  );

  const connectionId = searchParams.get("connectionId");
  const provider = searchParams.get("provider");
  const returnUrl = safeInternalReturnUrl(searchParams.get("returnUrl"));

  useEffect(() => {
    setStoredReturnUrl(window.sessionStorage.getItem("oauthReturnUrl"));
    setStoredProviderLabel(window.sessionStorage.getItem("oauthProviderLabel"));
  }, []);

  const destination = safeInternalReturnUrl(storedReturnUrl, returnUrl);

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.sessionStorage.removeItem("oauthReturnUrl");
          window.sessionStorage.removeItem("oauthProviderLabel");
          router.push(destination);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router, destination]);

  const handleContinue = () => {
    window.sessionStorage.removeItem("oauthReturnUrl");
    window.sessionStorage.removeItem("oauthProviderLabel");
    router.push(destination);
  };

  const label = storedProviderLabel
    ? storedProviderLabel
    : provider
      ? provider.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Your account";

  return (
    <AuthShell>
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-5 w-5" />
      </span>
      <AuthTitle description="Your agents can now use it when a tool needs it.">{label} is connected</AuthTitle>
      <button onClick={handleContinue} className={authPrimaryButtonClass}>Continue</button>
      <p className="mt-3 text-center text-xs text-stone-400">
        Returning in {countdown}s
      </p>
    </AuthShell>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense fallback={<AuthShell className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-stone-400" /></AuthShell>}>
      <OAuthSuccessContent />
    </Suspense>
  );
}
