import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * Keep private application surfaces server-protected, and keep the marketing
 * landing page for signed-out visitors only. Deciding both at the edge means
 * authorization never depends on a client effect or localStorage value, and a
 * signed-in member never sees a flash of marketing before being routed home.
 */
const cloudAuthMiddleware = auth((request) => {
  const signedIn = Boolean(request.auth?.user?.id);
  const { pathname, search, origin } = request.nextUrl;

  if (pathname === "/") {
    if (!signedIn) return NextResponse.next();
    return NextResponse.redirect(new URL("/studio/agents", origin));
  }

  if (signedIn) return NextResponse.next();

  const login = new URL("/login", origin);
  login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const desktopLocal = process.env.COMMONS_DESKTOP_SERVER === "1" &&
    request.cookies.get("commons-desktop-mode")?.value === "private-local";
  if (desktopLocal) {
    const { pathname, origin } = request.nextUrl;
    if (pathname === "/api/auth/session") return NextResponse.json(null);
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Cloud APIs are unavailable in Local mode." }, { status: 503 });
    }
    if (pathname === "/") return NextResponse.redirect(new URL("/studio/agents", origin));
    return NextResponse.next();
  }
  // Auth.js and the native sign-in handoff must remain reachable while signed
  // out. Guarding these routes redirects /login back to its own start route.
  if (request.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  return cloudAuthMiddleware(request, event as never);
}

export const config = {
  matcher: [
    "/",
    "/studio/:path*",
    "/sessions/:path*",
    "/settings/:path*",
    "/wallets/:path*",
    "/logs/:path*",
    "/usage/:path*",
    "/developers/:path*",
    "/library/:path*",
    "/brains/:path*",
    "/knowledge/:path*",
    "/api/:path*",
  ],
};
