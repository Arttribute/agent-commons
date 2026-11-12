import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { sendPaymentReceipt } from "@/lib/payment-receipts";
import Payment from "@/models/Payment";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; paymentId: string }> },
) {
  const { slug, paymentId } = await params,
    auth = await requireEducatorCourse(slug);
  if (auth.error) return auth.error;
  if (!/^[a-f0-9]{24}$/i.test(paymentId))
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const payment = await Payment.findOne({
    _id: paymentId,
    courseId: auth.course._id,
  });
  if (!payment)
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result = await sendPaymentReceipt(paymentId, {
    manual: true,
    resend: body.resend === true,
    requestId: body.requestId,
  });
  return NextResponse.json(result, {
    status:
      result.status === "sent" ? 200 : result.status === "busy" ? 409 : 422,
  });
}
