import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lookupPaymentReceipt } from "@/lib/payment-receipts";
import { receiptMoney } from "@/lib/payment-receipt-policy";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verify receipt | CommonLab",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    receipt = await lookupPaymentReceipt(token);
  if (!receipt) notFound();
  return (
    <main className="min-h-screen bg-[#faf8f2] px-5 py-12 text-[#21314b]">
      <article className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          CommonLab receipt verification
        </p>
        <h1 className="mt-5 text-2xl font-semibold">{receipt.programme}</h1>
        <p
          className={`mt-5 rounded-lg p-3 text-sm font-semibold ${receipt.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          {receipt.title}
        </p>
        <p className="my-7 text-4xl font-semibold tracking-tight">
          {receiptMoney(receipt.amountMinor, receipt.currency)}
        </p>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">Receipt number</dt>
            <dd className="mt-1 font-mono">{receipt.receiptNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Participants</dt>
            <dd>{receipt.quantity}</dd>
          </div>
          {receipt.when && (
            <div>
              <dt className="text-slate-500">When</dt>
              <dd>{receipt.when}</dd>
            </div>
          )}
          {receipt.location && (
            <div>
              <dt className="text-slate-500">Where</dt>
              <dd>{receipt.location}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Recorded</dt>
            <dd>
              {new Date(receipt.paidAt).toLocaleString("en-KE", {
                timeZone: "Africa/Nairobi",
              })}{" "}
              EAT
            </dd>
          </div>
        </dl>
        <p className="mt-7 border-t pt-5 text-xs leading-6 text-slate-500">
          This page checks the current receipt status in CommonLab.{" "}
          {receipt.note}
        </p>
      </article>
    </main>
  );
}
