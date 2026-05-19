"use client";

import { useState } from "react";
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
        <div className="mb-3 rounded-lg border border-lime-200 bg-lime-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-lime-700">
            Flexible payment option
          </p>
          <EnrolButton
            courseSlug={courseSlug}
            isFree={false}
            checkoutUrl={installment.checkoutUrl}
            label={installment.buttonLabel}
            accessCode={accessCode}
            showAccessCodeInput={false}
          />
          <p className="mt-2 text-xs leading-5 text-slate-700">
            {installment.description}
          </p>
        </div>
      )}
    </>
  );
}
