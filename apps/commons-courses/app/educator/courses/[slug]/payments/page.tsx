import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Payment from "@/models/Payment";
import PayoutLedger from "@/models/PayoutLedger";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { PaymentsTabs } from "@/components/educator/payments-tabs";
import { EmptyState, StatStrip } from "@/components/ui/surface";

export default async function CoursePaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const [payments, ledger] = await Promise.all([
    Payment.find({ courseId: result.course._id }).populate("userId", "name email").sort({ createdAt: -1 }).lean(),
    PayoutLedger.find({ courseId: result.course._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const currency = result.course.currency;
  const completed = payments.filter((payment) => payment.status === "completed");
  const gross = completed.reduce((sum, payment) => sum + payment.amount, 0);
  const platformFeePercent = result.course.educator?.platformFeePercent ?? 20;
  const platformFees = gross * (platformFeePercent / 100);

  const transactions = payments.map((payment) => {
    const user = payment.userId as unknown as { name?: string; email?: string };
    return {
      id: String(payment._id),
      name: user?.name || user?.email || "Learner",
      reference: payment.providerReference || "",
      codes: [payment.accessCode, payment.affiliateCode].filter(Boolean).join(" · "),
      amount: formatMoney(payment.amount, payment.currency),
      discount: payment.discountAmount ? `-${formatMoney(payment.discountAmount, payment.currency)}` : "",
      provider: payment.provider,
      status: payment.status,
      date: payment.createdAt ? new Date(payment.createdAt).toISOString() : "",
    };
  });
  const entries = ledger.map((entry) => ({
    id: String(entry._id),
    type: String(entry.type).replace(/_/g, " "),
    gross: formatMoney(entry.grossAmount, entry.currency),
    net: formatMoney(entry.netAmount, entry.currency),
    status: entry.status,
  }));

  return (
    <div>
      <CourseSectionHeader section="sales" />
      <StatStrip
        className="mb-6"
        items={[
          { label: "Gross", value: formatMoney(gross, currency) },
          { label: `Platform fee (${platformFeePercent}%)`, value: formatMoney(platformFees, currency) },
          { label: "Estimated net", value: formatMoney(gross - platformFees, currency) },
        ]}
      />
      {transactions.length || entries.length ? (
        <PaymentsTabs transactions={transactions} ledger={entries} />
      ) : (
        <EmptyState icon={CreditCard} title="No payments yet" />
      )}
    </div>
  );
}

function formatMoney(amount: number, currency?: string) {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", { style: "currency", currency: code }).format(amount);
}
