import crypto from "crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export type PaystackInitializeTransactionInput = {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  callback_url: string;
  channels?: Array<"card" | "bank" | "ussd" | "qr" | "mobile_money" | "bank_transfer">;
  subaccount?: string;
  bearer?: "account" | "subaccount";
  transaction_charge?: number;
  metadata?: Record<string, unknown>;
};

export type PaystackInitializeTransaction = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackEvent = {
  event: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  };
};

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }
  return secretKey;
}

export async function initializePaystackTransaction(
  input: PaystackInitializeTransactionInput
) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(json.message || "Paystack transaction initialization failed.");
  }

  return json.data as PaystackInitializeTransaction;
}

export function verifyPaystackWebhookSignature(body: string, signature: string) {
  const hash = crypto
    .createHmac("sha512", getPaystackSecretKey())
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
