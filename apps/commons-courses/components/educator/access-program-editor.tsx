"use client";

import { AccessCodeList } from "@/components/educator/access-code-list";
import { AffiliateList } from "@/components/educator/affiliate-list";
import { EarlyPaymentDiscountList } from "@/components/educator/early-payment-discount-list";
import type { AccessProgramForm } from "@/components/educator/access-program-types";
export type { AccessProgramForm } from "@/components/educator/access-program-types";

type Props = {
  value: AccessProgramForm;
  currency: string;
  onChange: (value: AccessProgramForm) => void;
};

const emptyAccessProgram: AccessProgramForm = {
  discounts: [],
  earlyPaymentDiscounts: [],
  scholarships: [],
  passes: [],
  affiliates: [],
};

export function normalizeAccessProgramForm(value?: Partial<AccessProgramForm>) {
  return {
    ...emptyAccessProgram,
    ...(value || {}),
    discounts: value?.discounts || [],
    earlyPaymentDiscounts: value?.earlyPaymentDiscounts || [],
    scholarships: value?.scholarships || [],
    passes: value?.passes || [],
    affiliates: value?.affiliates || [],
  };
}

export function AccessProgramEditor({ value, currency, onChange }: Props) {
  const accessProgram = normalizeAccessProgramForm(value);

  function setList<K extends keyof AccessProgramForm>(
    key: K,
    items: AccessProgramForm[K]
  ) {
    onChange({ ...accessProgram, [key]: items });
  }

  return (
    <section className="rounded-xl border border-slate-200 p-5">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Access programs</h2>
        <p className="mt-1 text-sm text-slate-500">
          Official codes for discounts, scholarships, passes, and affiliates.
        </p>
      </div>

      <div className="space-y-6">
        <AccessCodeList
          title="Promo codes"
          description="Reduce checkout price by a percentage or fixed amount."
          currency={currency}
          items={accessProgram.discounts}
          defaultAmount={10}
          onChange={(items) => setList("discounts", items)}
        />
        <EarlyPaymentDiscountList
          currency={currency}
          items={accessProgram.earlyPaymentDiscounts}
          onChange={(items) => setList("earlyPaymentDiscounts", items)}
        />
        <AccessCodeList
          title="Scholarships"
          description="Grant partial or full tuition support."
          currency={currency}
          items={accessProgram.scholarships}
          defaultAmount={100}
          onChange={(items) => setList("scholarships", items)}
        />
        <AccessCodeList
          title="Passes"
          description="Private access passes for partners, staff, or cohorts."
          currency={currency}
          items={accessProgram.passes}
          defaultAmount={100}
          onChange={(items) => setList("passes", items)}
        />
        <AffiliateList
          items={accessProgram.affiliates}
          onChange={(items) => setList("affiliates", items)}
        />
      </div>
    </section>
  );
}
