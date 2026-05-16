import Course from "@/models/Course";

export type AccessCodeKind =
  | "discount"
  | "early_payment"
  | "scholarship"
  | "pass";
export type PaymentPlan = "one_time" | "installment";

export type AccessCodeRule = {
  id: string;
  code: string;
  label?: string;
  active?: boolean;
  amountType?: "percent" | "fixed";
  amount?: number;
  maxRedemptions?: number;
  redeemedCount?: number;
  expiresAt?: Date | string;
};

export type AffiliateRule = {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  commissionType?: "percent" | "fixed";
  commissionAmount?: number;
  conversions?: number;
};

export type EarlyPaymentDiscountRule = {
  id: string;
  label?: string;
  active?: boolean;
  amountType?: "percent" | "fixed";
  amount?: number;
  deadline?: Date | string;
  maxRedemptions?: number;
  redeemedCount?: number;
};

export type CourseAccessProgram = {
  discounts?: AccessCodeRule[];
  earlyPaymentDiscounts?: EarlyPaymentDiscountRule[];
  scholarships?: AccessCodeRule[];
  passes?: AccessCodeRule[];
  affiliates?: AffiliateRule[];
};

export type AccessPriceResult = {
  originalAmount: number;
  finalAmount: number;
  discountAmount: number;
  accessCode?: string;
  accessCodeType?: AccessCodeKind;
  accessLabel?: string;
  affiliateCode?: string;
  affiliateName?: string;
  affiliateCommissionAmount?: number;
  freeAccess: boolean;
};

function cleanCode(code?: string | null) {
  return (code || "").trim().toUpperCase();
}

function codeIsRedeemable(rule: AccessCodeRule) {
  if (rule.active === false) return false;
  if (rule.maxRedemptions && (rule.redeemedCount || 0) >= rule.maxRedemptions) {
    return false;
  }
  if (rule.expiresAt && new Date(rule.expiresAt).getTime() < Date.now()) {
    return false;
  }
  return true;
}

function earlyDiscountIsRedeemable(rule: EarlyPaymentDiscountRule, now: Date) {
  if (rule.active === false) return false;
  if (rule.maxRedemptions && (rule.redeemedCount || 0) >= rule.maxRedemptions) {
    return false;
  }
  if (!rule.deadline) return false;
  return new Date(rule.deadline).getTime() >= now.getTime();
}

function findAccessCode(program: CourseAccessProgram | undefined, code?: string | null) {
  const normalized = cleanCode(code);
  if (!normalized) return null;
  const groups: Array<[AccessCodeKind, AccessCodeRule[] | undefined]> = [
    ["pass", program?.passes],
    ["scholarship", program?.scholarships],
    ["discount", program?.discounts],
  ];

  for (const [kind, items] of groups) {
    const rule = items?.find((item) => cleanCode(item.code) === normalized);
    if (rule && codeIsRedeemable(rule)) return { kind, rule };
  }
  return null;
}

function findAffiliate(program: CourseAccessProgram | undefined, code?: string | null) {
  const normalized = cleanCode(code);
  if (!normalized) return null;
  return (
    program?.affiliates?.find(
      (item) => item.active !== false && cleanCode(item.code) === normalized
    ) || null
  );
}

function calculateDiscount(amount: number, rule: AccessCodeRule) {
  if ((rule.amountType || "percent") === "fixed") {
    return Math.min(amount, Math.max(0, rule.amount || 0));
  }
  return Math.min(amount, amount * (Math.max(0, rule.amount || 0) / 100));
}

function calculateEarlyDiscount(amount: number, rule: EarlyPaymentDiscountRule) {
  if ((rule.amountType || "percent") === "fixed") {
    return Math.min(amount, Math.max(0, rule.amount || 0));
  }
  return Math.min(amount, amount * (Math.max(0, rule.amount || 0) / 100));
}

function calculateCommission(amount: number, affiliate: AffiliateRule) {
  if (affiliate.commissionType === "fixed") {
    return Math.max(0, affiliate.commissionAmount || 0);
  }
  return amount * (Math.max(0, affiliate.commissionAmount || 0) / 100);
}

export function priceCourseAccess(params: {
  amount: number;
  accessProgram?: CourseAccessProgram;
  accessCode?: string | null;
  affiliateCode?: string | null;
  now?: Date;
}): AccessPriceResult {
  const originalAmount = Math.max(0, params.amount);
  const now = params.now || new Date();
  const access = findAccessCode(params.accessProgram, params.accessCode);
  const affiliate = findAffiliate(params.accessProgram, params.affiliateCode);
  const earlyDiscounts = params.accessProgram?.earlyPaymentDiscounts || [];
  const earlyCandidates = earlyDiscounts
    .filter((rule) => earlyDiscountIsRedeemable(rule, now))
    .map((rule) => ({
      kind: "early_payment" as const,
      id: rule.id,
      label: rule.label,
      discountAmount: calculateEarlyDiscount(originalAmount, rule),
    }));
  const candidates = [
    ...(access
      ? [
          {
            kind: access.kind,
            id: access.rule.code,
            label: access.rule.label,
            discountAmount: calculateDiscount(originalAmount, access.rule),
          },
        ]
      : []),
    ...earlyCandidates,
  ];
  const bestDiscount = candidates.sort(
    (a, b) => b.discountAmount - a.discountAmount
  )[0];
  const discountAmount = bestDiscount?.discountAmount || 0;
  const finalAmount = Math.max(0, originalAmount - discountAmount);
  const affiliateCommissionAmount = affiliate
    ? calculateCommission(finalAmount, affiliate)
    : undefined;

  return {
    originalAmount,
    finalAmount,
    discountAmount,
    accessCode: bestDiscount?.id,
    accessCodeType: bestDiscount?.kind,
    accessLabel: bestDiscount?.label,
    affiliateCode: affiliate?.code,
    affiliateName: affiliate?.name,
    affiliateCommissionAmount,
    freeAccess: originalAmount > 0 && finalAmount <= 0,
  };
}

export async function recordAccessProgramConversion(params: {
  courseId: string;
  accessCode?: string;
  accessCodeType?: AccessCodeKind;
  affiliateCode?: string;
}) {
  const updates: Record<string, number> = {};
  const arrayFilters: Record<string, string | undefined>[] = [];
  if (params.accessCode && params.accessCodeType) {
    const field = getAccessProgramField(params.accessCodeType);
    updates[`accessProgram.${field}.$[access].redeemedCount`] = 1;
    arrayFilters.push({ [getAccessProgramMatchField(params.accessCodeType)]: params.accessCode });
  }
  if (params.affiliateCode) {
    updates["accessProgram.affiliates.$[affiliate].conversions"] = 1;
    arrayFilters.push({ "affiliate.code": params.affiliateCode });
  }
  if (Object.keys(updates).length === 0) return;

  await Course.updateOne(
    { _id: params.courseId },
    { $inc: updates },
    { arrayFilters }
  );
}

function getAccessProgramField(type: AccessCodeKind) {
  if (type === "scholarship") return "scholarships";
  if (type === "early_payment") return "earlyPaymentDiscounts";
  return `${type}s`;
}

function getAccessProgramMatchField(type: AccessCodeKind) {
  return type === "early_payment" ? "access.id" : "access.code";
}
