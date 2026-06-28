"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FlaskConical } from "lucide-react";
import { LoadingScreen } from "@/components/loading-screen";

function CheckoutSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      if (!token) {
        setError("This checkout sign-in link is missing.");
        return;
      }

      const result = await signIn("checkout", {
        token,
        redirect: false,
        callbackUrl,
      });

      if (cancelled) return;
      if (result?.error) {
        setError("This checkout sign-in link is invalid or expired.");
        return;
      }

      router.replace(callbackUrl);
    }

    finishSignIn();
    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router, token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-950">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            CommonLab
          </span>
        </Link>
        {error ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-slate-900">
              We could not finish sign-in
            </h1>
            <p className="mb-6 text-sm text-slate-500">{error}</p>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
            >
              Sign in
            </Link>
          </>
        ) : (
          <LoadingScreen
            title="Opening your course"
            subtitle="Your payment is complete. We are linking your course access now."
            compact
            tone="amber"
          />
        )}
      </div>
    </div>
  );
}

export default function CheckoutSignInPage() {
  return (
    <Suspense>
      <CheckoutSignIn />
    </Suspense>
  );
}
