import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const callbackUrl = String(form.get("callbackUrl") ?? "/dashboard");
  const origin = request.nextUrl.origin;
  const authorizeUrl = await signIn("commons", {
    redirect: false,
    redirectTo: new URL(callbackUrl, origin).toString(),
  });
  if (!authorizeUrl || authorizeUrl.includes("error=Configuration")) {
    return NextResponse.redirect(
      new URL("/auth/signin?authError=Could+not+start+sign-in", origin),
    );
  }
  return NextResponse.redirect(
    new URL(
      `/auth/signin?authorize_url=${encodeURIComponent(authorizeUrl)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
      origin,
    ),
  );
}
