import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const callbackUrl = String(form.get("callbackUrl") ?? "/agents");
  const origin = request.nextUrl.origin;
  const authorizeUrl = await signIn("commons", {
    redirect: false,
    redirectTo: new URL(callbackUrl, origin).toString(),
  });
  if (!authorizeUrl || authorizeUrl.includes("error=Configuration")) {
    return NextResponse.redirect(new URL("/login?authError=Could+not+start+sign-in", origin));
  }
  return NextResponse.redirect(
    new URL(`/login?authorize_url=${encodeURIComponent(authorizeUrl)}&callbackUrl=${encodeURIComponent(callbackUrl)}`, origin),
  );
}
