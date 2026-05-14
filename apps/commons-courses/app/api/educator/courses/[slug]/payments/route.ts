import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Payment from "@/models/Payment";
import PayoutLedger from "@/models/PayoutLedger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const payments = await Payment.find({ courseId: result.course._id })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .lean();
  const ledger = await PayoutLedger.find({ courseId: result.course._id })
    .sort({ createdAt: -1 })
    .lean();

  const completed = payments.filter((payment) => payment.status === "completed");
  const gross = completed.reduce((sum, payment) => sum + payment.amount, 0);
  const platformFeePercent = result.course.educator?.platformFeePercent ?? 20;
  const platformFees = gross * (platformFeePercent / 100);
  const net = gross - platformFees;

  return NextResponse.json({
    payments,
    ledger,
    summary: {
      gross,
      platformFees,
      net,
      currency: result.course.currency || "USD",
      completedPayments: completed.length,
      platformFeePercent,
    },
  });
}
