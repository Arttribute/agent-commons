import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders, resolveGiftRecipient } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl)
    return NextResponse.json(
      { message: "Server base URL not configured" },
      { status: 500 },
    );
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.recipientEmail === "string"
      ? body.recipientEmail.trim().toLowerCase()
      : "";
  const userId =
    typeof body?.recipientPrincipalId === "string"
      ? body.recipientPrincipalId.trim()
      : "";
  const idempotencyKey =
    typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (
    Boolean(email) === Boolean(userId) ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    return NextResponse.json(
      { message: "Enter either a valid recipient email or user ID." },
      { status: 400 },
    );
  }
  if (
    !Number.isSafeInteger(body?.amount) ||
    body.amount <= 0 ||
    !idempotencyKey ||
    (body.message !== undefined &&
      (typeof body.message !== "string" || body.message.length > 240))
  ) {
    return NextResponse.json(
      {
        message:
          "Provide a positive whole credit amount, a request ID, and a note of at most 240 characters.",
      },
      { status: 400 },
    );
  }

  let recipientPrincipalId: string | null;
  try {
    recipientPrincipalId = await resolveGiftRecipient(
      email ? { email } : { userId },
    );
  } catch {
    return NextResponse.json(
      {
        message:
          "Recipient lookup is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
  if (!recipientPrincipalId) {
    return NextResponse.json(
      {
        message:
          "We couldn't find an Agent Commons account for that email or user ID. Ask them to sign up first.",
      },
      { status: 404 },
    );
  }
  if (recipientPrincipalId === user.userId) {
    return NextResponse.json(
      { message: "You cannot gift credits to yourself." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${baseUrl}/v1/credits/gifts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await backendAuthHeaders()),
      },
      body: JSON.stringify({
        recipientPrincipalId,
        amount: body.amount,
        message: body.message,
        idempotencyKey,
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!payload) throw new Error("Invalid gift response");
    return NextResponse.json(payload, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        message:
          "We couldn't confirm the gift. Retry with the same details to check it safely.",
      },
      { status: 503 },
    );
  }
}
