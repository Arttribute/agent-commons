import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Keep private application surfaces server-protected. Besides preventing an
 * anonymous shell from mounting data connections, this ensures authorization
 * never depends on a client effect or localStorage value.
 */
export default auth((request) => {
  if (request.auth?.user?.id) return NextResponse.next();

  const login = new URL("/login", request.nextUrl.origin);
  login.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    "/studio/:path*",
    "/sessions/:path*",
    "/settings/:path*",
    "/wallets/:path*",
    "/logs/:path*",
    "/usage/:path*",
    "/library/:path*",
  ],
};
