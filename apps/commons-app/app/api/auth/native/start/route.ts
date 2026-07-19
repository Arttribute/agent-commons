import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";
import { safeAuthCallback } from "@/lib/auth-callback";

async function start(request: NextRequest, callbackUrl: string) {
  const origin = request.nextUrl.origin;
  const safeCallbackUrl = safeAuthCallback(callbackUrl);
  if (
    !process.env.COMMONS_IDENTITY_ISSUER ||
    !process.env.COMMONS_IDENTITY_CLIENT_ID
  ) {
    console.error("[auth/native/start] Commons Identity provider is not configured", {
      hasIssuer: Boolean(process.env.COMMONS_IDENTITY_ISSUER),
      hasClientId: Boolean(process.env.COMMONS_IDENTITY_CLIENT_ID),
    });
    return NextResponse.redirect(
      new URL("/login?authError=Sign-in+is+not+configured", origin),
    );
  }

  let authorizeUrl: string | undefined;
  try {
    authorizeUrl = await signIn("commons", {
      redirect: false,
      redirectTo: new URL(safeCallbackUrl, origin).toString(),
    });
  } catch (error) {
    console.error("[auth/native/start] Could not start Commons sign-in", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(
      new URL("/login?authError=Could+not+start+sign-in", origin),
    );
  }
  if (!authorizeUrl || authorizeUrl.includes("error=Configuration")) {
    return NextResponse.redirect(new URL("/login?authError=Could+not+start+sign-in", origin));
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
    return NextResponse.redirect(new URL("/login?authError=Could+not+prepare+sign-in", origin));
  }
  return NextResponse.redirect(
    new URL(`/login?oauth_query=${encodeURIComponent(oauthQuery)}&callbackUrl=${encodeURIComponent(safeCallbackUrl)}`, origin),
  );
}

export async function GET(request: NextRequest) {
  return start(request, request.nextUrl.searchParams.get("callbackUrl") ?? "");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return start(request, String(form.get("callbackUrl") ?? ""));
}
