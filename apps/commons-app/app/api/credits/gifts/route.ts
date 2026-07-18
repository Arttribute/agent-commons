import { NextRequest, NextResponse } from "next/server";
import {
  backendAuthHeaders,
  resolvePrincipalByEmail,
} from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { normalizePrincipalId } from "@/lib/principal-id";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const body = await request.json();

  // Gifts are addressed by email in the UI; resolve to the recipient's
  // Agent Commons account here so the credit ledger only sees principal ids.
  const { recipientEmail, ...rest } = body ?? {};
  let recipientPrincipalId: string | undefined = rest?.recipientPrincipalId;
  if (!recipientPrincipalId && typeof recipientEmail === "string") {
    const resolved = await resolvePrincipalByEmail(recipientEmail);
    if (!resolved) {
      return NextResponse.json(
        {
          message:
            "We couldn't find an Agent Commons account for that email. Ask them to sign up first.",
        },
        { status: 404 },
      );
    }
    recipientPrincipalId = normalizePrincipalId(resolved);
  }

  const res = await fetch(`${baseUrl}/v1/credits/gifts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await backendAuthHeaders()),
    },
    body: JSON.stringify({ ...rest, recipientPrincipalId }),
  });
  return NextResponse.json(await res.json().catch(() => ({})), {
    status: res.status,
  });
}
