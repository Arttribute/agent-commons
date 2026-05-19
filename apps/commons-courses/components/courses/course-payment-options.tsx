"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { EnrolButton } from "@/components/courses/enrol-button";

interface Props {
  courseSlug: string;
  isFree: boolean;
  checkoutUrl: string;
  primaryLabel?: string;
  installment?: {
    checkoutUrl: string;
    buttonLabel: string;
    description: string;
  };
}

export function CoursePaymentOptions({
  courseSlug,
  isFree,
  checkoutUrl,
  primaryLabel,
  installment,
}: Props) {
  const [accessCode, setAccessCode] = useState("");
  const [installmentInfoOpen, setInstallmentInfoOpen] = useState(false);

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

      <div className="mb-3">
        <EnrolButton
          courseSlug={courseSlug}
          isFree={isFree}
          checkoutUrl={checkoutUrl}
          label={primaryLabel}
          accessCode={accessCode}
          showAccessCodeInput={false}
        />
      </div>

      {!isFree && installment && (
        <div className="mb-3">
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <EnrolButton
                courseSlug={courseSlug}
                isFree={false}
                checkoutUrl={installment.checkoutUrl}
                label={installment.buttonLabel}
                accessCode={accessCode}
                showAccessCodeInput={false}
              />
            </div>
            <button
              type="button"
              aria-label="Show payment plan details"
              aria-expanded={installmentInfoOpen}
              onClick={() => setInstallmentInfoOpen((open) => !open)}
              className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          {installmentInfoOpen && (
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              {installment.description}
            </p>
          )}
        </div>
      )}
    </>
  );
}
