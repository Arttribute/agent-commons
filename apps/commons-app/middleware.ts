import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Keep private application surfaces server-protected, and keep the marketing
 * landing page for signed-out visitors only. Deciding both at the edge means
 * authorization never depends on a client effect or localStorage value, and a
 * signed-in member never sees a flash of marketing before being routed home.
 */
export default auth((request) => {
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

export const config = {
  matcher: [
    "/",
    "/studio/:path*",
    "/sessions/:path*",
    "/settings/:path*",
    "/wallets/:path*",
    "/logs/:path*",
    "/usage/:path*",
    "/library/:path*",
    "/brains/:path*",
  ],
};
