"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AuthShell, AuthTitle, authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/auth-shell";
import { safeInternalReturnUrl } from "@/lib/safe-return-url";

function OAuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [storedReturnUrl, setStoredReturnUrl] = useState<string | null>(null);

  const message = searchParams.get("message") || "An unknown error occurred";
  const returnUrl = safeInternalReturnUrl(searchParams.get("returnUrl"));
  const destination = safeInternalReturnUrl(storedReturnUrl, returnUrl);

  useEffect(() => {
    setStoredReturnUrl(window.sessionStorage.getItem("oauthReturnUrl"));
  }, []);

  const handleRetry = () => {
    router.back();
  };

  const handleGoHome = () => {
    router.push(destination);
  };

  return (
    <AuthShell>
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <X className="h-5 w-5" />
      </span>
      <AuthTitle description="The connection was not completed. You may have declined access, or the request expired.">
        Could not connect
      </AuthTitle>
      <p className="mb-5 rounded-[10px] bg-stone-100 px-3 py-2.5 text-xs leading-5 text-stone-600">{message}</p>
      <div className="flex gap-2">
        <button onClick={handleGoHome} className={authSecondaryButtonClass}>Go back</button>
        <button onClick={handleRetry} className={authPrimaryButtonClass}>Try again</button>
      </div>
    </AuthShell>
  );
}

export default function OAuthErrorPage() {
  return (
    <Suspense fallback={<AuthShell><span className="text-sm text-stone-400">Loading</span></AuthShell>}>
      <OAuthErrorContent />
    </Suspense>
  );
}
