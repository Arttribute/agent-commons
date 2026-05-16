export type AccessCodeForm = {
  id: string;
  code: string;
  label?: string;
  active: boolean;
  amountType: "percent" | "fixed";
  amount: number;
  maxRedemptions?: number;
  redeemedCount?: number;
  expiresAt?: string;
};

export type AffiliateForm = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  commissionType: "percent" | "fixed";
  commissionAmount: number;
  conversions?: number;
};

export type EarlyPaymentDiscountForm = {
  id: string;
  label?: string;
  active: boolean;
  amountType: "percent" | "fixed";
  amount: number;
  deadline?: string;
  maxRedemptions?: number;
  redeemedCount?: number;
};

export type AccessProgramForm = {
  discounts: AccessCodeForm[];
  earlyPaymentDiscounts: EarlyPaymentDiscountForm[];
  scholarships: AccessCodeForm[];
  passes: AccessCodeForm[];
  affiliates: AffiliateForm[];
};
