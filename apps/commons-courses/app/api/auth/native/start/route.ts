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
  const prepared = await fetch(authorizeUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const preparedData = (await prepared.json().catch(() => ({}))) as {
    url?: string;
  };
  const oauthQuery = preparedData.url
    ? new URL(preparedData.url, authorizeUrl).search.slice(1)
    : "";
  if (!prepared.ok || !oauthQuery) {
    return NextResponse.redirect(
      new URL("/auth/signin?authError=Could+not+prepare+sign-in", origin),
    );
  }
  return NextResponse.redirect(
    new URL(
      `/auth/signin?oauth_query=${encodeURIComponent(oauthQuery)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
      origin,
    ),
  );
}
