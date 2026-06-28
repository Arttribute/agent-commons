import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

async function start(request: NextRequest, callbackUrl: string) {
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

export async function GET(request: NextRequest) {
  return start(request, request.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return start(request, String(form.get("callbackUrl") ?? "/dashboard"));
}
