import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/auth";
import { safeAuthCallback } from "@/lib/auth-callback";
import { loginOutcome, loginPageUrl, startFailedUrl } from "@/lib/login-flow";

async function start(request: NextRequest, callbackUrl: string) {
  const origin = request.nextUrl.origin;
  const safeCallbackUrl = safeAuthCallback(callbackUrl);
  // Messages identity sent back to /login, shown once the new request is ready.
  const outcome = loginOutcome(Object.fromEntries(request.nextUrl.searchParams));
  const failed = (message: string) =>
    NextResponse.redirect(new URL(startFailedUrl(safeCallbackUrl, message), origin));
  if (
    !process.env.COMMONS_IDENTITY_ISSUER ||
    !process.env.COMMONS_IDENTITY_CLIENT_ID
  ) {
    console.error("[auth/native/start] Commons Identity provider is not configured", {
      hasIssuer: Boolean(process.env.COMMONS_IDENTITY_ISSUER),
      hasClientId: Boolean(process.env.COMMONS_IDENTITY_CLIENT_ID),
    });
    return failed("Sign-in is not configured");
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
    return failed("Could not start sign-in");
  }
  if (!authorizeUrl || authorizeUrl.includes("error=Configuration")) {
    return failed("Could not start sign-in");
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
    return failed("Could not prepare sign-in");
  }
  return NextResponse.redirect(
    new URL(loginPageUrl(oauthQuery, safeCallbackUrl, outcome), origin),
  );
}

export async function GET(request: NextRequest) {
  return start(request, request.nextUrl.searchParams.get("callbackUrl") ?? "");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return start(request, String(form.get("callbackUrl") ?? ""));
}
