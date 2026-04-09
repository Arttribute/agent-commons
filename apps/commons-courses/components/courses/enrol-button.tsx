"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, X, ExternalLink } from "lucide-react";

interface Props {
  courseSlug: string;
  isFree: boolean;
  checkoutUrl: string;
}

type TermsStatus = "loading" | "not-logged-in" | "pending" | "accepted";

export function EnrolButton({ courseSlug, isFree, checkoutUrl }: Props) {
  const [termsStatus, setTermsStatus] = useState<TermsStatus>("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

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

  const handleEnrolClick = () => {
    if (termsStatus === "accepted") {
      // Terms already accepted — go straight to checkout
      window.location.href = checkoutUrl;
    } else {
      setModalOpen(true);
    }
  };

  const handleAccept = async () => {
    if (!checked) return;
    setAccepting(true);
    setError("");
    try {
      const res = await fetch("/api/user/accept-terms", { method: "POST" });
      if (!res.ok) throw new Error("Failed to record acceptance.");
      setTermsStatus("accepted");
      setModalOpen(false);
      // Proceed to checkout after accepting
      window.location.href = checkoutUrl;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (termsStatus === "loading") {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-100 text-slate-400 text-sm font-bold">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (termsStatus === "not-logged-in") {
    return (
      <Link
        href={`/auth/signin?callbackUrl=/courses/${courseSlug}`}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity"
      >
        Sign in to enrol <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={handleEnrolClick}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity"
      >
        {isFree ? "Enrol for free" : "Enrol now"}{" "}
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
