import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Payment from "@/models/Payment";
import PayoutLedger from "@/models/PayoutLedger";
import { Nav } from "@/components/nav";

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
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold text-slate-950">
          Payments
        </h1>
        <p className="mb-8 text-sm text-slate-500">{result.course.title}</p>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Metric label="Gross" value={formatMoney(gross, result.course.currency)} />
          <Metric label="Platform fees" value={formatMoney(platformFees, result.course.currency)} />
          <Metric label="Estimated net" value={formatMoney(net, result.course.currency)} />
        </div>

        <h2 className="mb-3 text-lg font-bold text-slate-900">Transactions</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {payments.map((payment) => {
            const user = payment.userId as unknown as { name?: string; email?: string };
            return (
              <div
                key={String(payment._id)}
                className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px_120px]"
              >
                <div>
                  <p className="font-bold text-slate-900">{user?.name || user?.email}</p>
                  <p className="text-xs text-slate-500">{payment.providerReference}</p>
                </div>
                <span className="text-sm">{formatMoney(payment.amount, payment.currency)}</span>
                <span className="text-sm">{payment.provider}</span>
                <span className="text-sm">{payment.status}</span>
              </div>
            );
          })}
          {payments.length === 0 && (
            <p className="p-6 text-sm text-slate-500">No payments yet.</p>
          )}
        </div>

        <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900">Payout ledger</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200">
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
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
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
