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
  const prepared = await fetch(authorizeUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "manual",
  });
  const preparedData = (await prepared.json().catch(() => ({}))) as {
    url?: string;
  };
  const preparedUrl = preparedData.url ?? prepared.headers.get("location");
  const oauthQuery = preparedUrl
    ? new URL(preparedUrl, authorizeUrl).search.slice(1)
    : "";
  if ((!prepared.ok && !preparedUrl) || !oauthQuery) {
    return NextResponse.redirect(new URL("/login?authError=Could+not+prepare+sign-in", origin));
  }
  return NextResponse.redirect(
    new URL(`/login?oauth_query=${encodeURIComponent(oauthQuery)}&callbackUrl=${encodeURIComponent(callbackUrl)}`, origin),
  );
}
