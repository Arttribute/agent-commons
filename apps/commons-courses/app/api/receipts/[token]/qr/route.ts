import { lookupPaymentReceipt, receiptQR } from "@/lib/payment-receipts";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!(await lookupPaymentReceipt(token)))
    return new Response("Receipt not found", { status: 404 });
  const image = await receiptQR(token);
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
