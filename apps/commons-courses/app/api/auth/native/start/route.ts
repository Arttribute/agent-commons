import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { safeAuthCallback } from "@/lib/auth-callback";

async function start(request: NextRequest, callbackUrl: string) {
  const origin = request.nextUrl.origin;
  const safeCallbackUrl = safeAuthCallback(callbackUrl);
  const authorizeUrl = await signIn("commons", {
    redirect: false,
    redirectTo: new URL(safeCallbackUrl, origin).toString(),
  });
  if (!authorizeUrl || authorizeUrl.includes("error=Configuration")) {
    if (request.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json(
        { error: "Could not start sign-in" },
        { status: 502 }
      );
    }
    return NextResponse.redirect(
      new URL(
        `/auth/signin?authError=Could+not+start+sign-in&callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
        origin,
      ),
    );
  }
  if (request.nextUrl.searchParams.get("direct") === "1") {
    return NextResponse.redirect(authorizeUrl);
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
    if (request.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json(
        { error: "Could not prepare sign-in" },
        { status: 502 }
      );
    }
    return NextResponse.redirect(
      new URL(
        `/auth/signin?authError=Could+not+prepare+sign-in&callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
        origin,
      ),
    );
  }
  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ oauthQuery });
  }
  return NextResponse.redirect(
    new URL(
      `/auth/signin?oauth_query=${encodeURIComponent(oauthQuery)}&callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
      origin,
    ),
  );
}

export async function GET(request: NextRequest) {
  return start(request, request.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return start(request, String(form.get("callbackUrl") ?? "/dashboard"));
}
