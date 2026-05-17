import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Payment from "@/models/Payment";
import PayoutLedger from "@/models/PayoutLedger";
import { ScrollableListFrame } from "@/components/educator/scrollable-list-frame";

export default async function CoursePaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const [payments, ledger] = await Promise.all([
    Payment.find({ courseId: result.course._id })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean(),
    PayoutLedger.find({ courseId: result.course._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const completed = payments.filter((payment) => payment.status === "completed");
  const gross = completed.reduce((sum, payment) => sum + payment.amount, 0);
  const platformFeePercent = result.course.educator?.platformFeePercent ?? 20;
  const platformFees = gross * (platformFeePercent / 100);
  const net = gross - platformFees;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Revenue
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Payments</h2>
        <p className="mt-2 text-sm text-slate-500">
          Transactions, discounts, providers, and payout ledger activity.
        </p>
      </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Gross" value={formatMoney(gross, result.course.currency)} />
          <Metric label="Platform fees" value={formatMoney(platformFees, result.course.currency)} />
          <Metric label="Estimated net" value={formatMoney(net, result.course.currency)} />
        </div>

        <ScrollableListFrame title="Transactions" count={payments.length} rowHeight={84}>
          <div className="min-w-[860px]">
          {payments.map((payment) => {
            const user = payment.userId as unknown as { name?: string; email?: string };
            return (
              <div
                key={String(payment._id)}
              className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px_120px_120px]"
            >
                <div>
                  <p className="font-bold text-slate-900">{user?.name || user?.email}</p>
                  <p className="text-xs text-slate-500">{payment.providerReference}</p>
                  {(payment.accessCode || payment.affiliateCode) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {[payment.accessCode, payment.affiliateCode]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-sm">{formatMoney(payment.amount, payment.currency)}</span>
                <span className="text-sm">
                  {payment.discountAmount
                    ? `-${formatMoney(payment.discountAmount, payment.currency)}`
                    : "None"}
                </span>
                <span className="text-sm">{payment.provider}</span>
                <span className="text-sm">{payment.status}</span>
              </div>
            );
          })}
          {payments.length === 0 && (
            <p className="p-6 text-sm text-slate-500">No payments yet.</p>
          )}
        </div>
        </ScrollableListFrame>

        <ScrollableListFrame title="Payout ledger" count={ledger.length} rowHeight={64}>
          <div className="min-w-[680px]">
          {ledger.map((entry) => (
            <div
              key={String(entry._id)}
              className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px_120px]"
            >
              <span className="font-bold text-slate-900">{entry.type}</span>
              <span>{formatMoney(entry.grossAmount, entry.currency)}</span>
              <span>{formatMoney(entry.netAmount, entry.currency)}</span>
              <span>{entry.status}</span>
            </div>
          ))}
          {ledger.length === 0 && (
            <p className="p-6 text-sm text-slate-500">
              Ledger entries are created after completed payment webhooks.
            </p>
          )}
        </div>
        </ScrollableListFrame>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function formatMoney(amount: number, currency?: string) {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", {
    style: "currency",
    currency: code,
  }).format(amount);
}
