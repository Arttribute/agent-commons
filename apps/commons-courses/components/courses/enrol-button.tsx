"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";
import { ArrowRight, Loader2, X, ExternalLink } from "lucide-react";

interface Props {
  courseSlug: string;
  isFree: boolean;
  checkoutUrl: string;
  label?: string;
}

type TermsStatus = "loading" | "not-logged-in" | "pending" | "accepted";

export function EnrolButton({ isFree, checkoutUrl, label }: Props) {
  const [termsStatus, setTermsStatus] = useState<TermsStatus>("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/user/terms-status");
      const data = await res.json();
      if (!data.loggedIn) {
        setTermsStatus("not-logged-in");
      } else if (data.accepted) {
        setTermsStatus("accepted");
      } else {
        setTermsStatus("pending");
      }
    } catch {
      setTermsStatus("pending");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    getProviders().then((providers) => {
      setGoogleAvailable(Boolean(providers?.google));
    });
  }, []);

  const buildCheckoutUrl = useCallback(() => {
    const url = new URL(checkoutUrl, window.location.origin);
    if (accessCode.trim()) {
      url.searchParams.set("accessCode", accessCode.trim());
    }
    return `${url.pathname}${url.search}`;
  }, [accessCode, checkoutUrl]);

  const buildGuestCheckoutUrl = useCallback(() => {
    const url = new URL(buildCheckoutUrl(), window.location.origin);
    url.searchParams.set("learnerEmail", email.trim());
    url.searchParams.set("acceptTerms", "1");
    return `${url.pathname}${url.search}`;
  }, [buildCheckoutUrl, email]);

  const handleEnrolClick = () => {
    if (termsStatus === "accepted") {
      window.location.href = buildCheckoutUrl();
    } else {
      setModalOpen(true);
    }
  };

  const handleAccept = async () => {
    if (!checked) return;
    setAccepting(true);
    setError("");
    try {
      if (termsStatus === "not-logged-in") {
        if (!email.trim()) {
          setError("Enter the email you want linked to this course.");
          return;
        }
        window.location.href = buildGuestCheckoutUrl();
        return;
      }

      const res = await fetch("/api/user/accept-terms", { method: "POST" });
      if (!res.ok) throw new Error("Failed to record acceptance.");
      setTermsStatus("accepted");
      setModalOpen(false);
      window.location.href = buildCheckoutUrl();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleGoogle = () => {
    if (!checked) {
      setError("Accept the terms first, then continue with Google.");
      return;
    }
    const url = new URL(buildCheckoutUrl(), window.location.origin);
    url.searchParams.set("acceptTerms", "1");
    signIn("google", {
      callbackUrl: `${url.pathname}${url.search}`,
    });
  };

  if (termsStatus === "loading") {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-100 text-slate-400 text-sm font-bold">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <>
      {!isFree && (
        <label className="mb-3 block">
          <span className="text-xs font-bold text-slate-600">
            Promo, scholarship, or pass code
          </span>
          <input
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </label>
      )}
      <button
        onClick={handleEnrolClick}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity"
      >
        {label || (isFree ? "Enrol for free" : "Enrol now")}{" "}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      {/* T&C modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Terms &amp; Conditions
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Summary */}
            <div className="px-6 py-5 space-y-3 text-sm text-slate-600 leading-relaxed max-h-72 overflow-y-auto">
              <p>
                Before enrolling, please review the key points of our Terms
                &amp; Conditions:
              </p>
              <ul className="space-y-2 list-disc pl-5 text-slate-500">
                <li>
                  Course access is personal and non-transferable. You may not
                  share your account or distribute course materials.
                </li>
                <li>
                  Paid courses carry a 14-day refund window, provided less
                  than 20% of content has been completed.
                </li>
                <li>
                  All course content is the intellectual property of Agent
                  Commons. Code samples are MIT-licenced unless stated
                  otherwise.
                </li>
                <li>
                  Live class sessions may be recorded and made available to
                  enrolled students.
                </li>
                <li>
                  Certificates of completion are records of course progress,
                  not professional qualifications.
                </li>
              </ul>
              <Link
                href="/terms"
                target="_blank"
                className="inline-flex items-center gap-1 font-semibold text-slate-900 underline underline-offset-2 mt-1"
              >
                Read full Terms &amp; Conditions{" "}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Checkbox + CTA */}
            <div className="px-6 py-5 border-t border-slate-100 space-y-4">
              {termsStatus === "not-logged-in" && (
                <div className="space-y-3">
                  {googleAvailable && (
                    <button
                      type="button"
                      onClick={handleGoogle}
                      disabled={!checked || accepting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <GoogleLogo />
                      Continue with Google
                    </button>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                      Email for course access
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </label>
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900 cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-slate-600 leading-snug select-none">
                  I have read and agree to the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-slate-900 underline underline-offset-2"
                  >
                    Terms &amp; Conditions
                  </Link>
                  .
                </span>
              </label>

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              <button
                onClick={handleAccept}
                disabled={!checked || accepting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Accept &amp; {isFree ? "Enrol for free" : "Continue to payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
