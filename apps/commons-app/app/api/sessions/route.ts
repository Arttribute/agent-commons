import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/sessions${req.nextUrl.search}`;
  const res = await fetch(backendUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.get("authorization")
        ? { authorization: req.headers.get("authorization")! }
        : {}),
    },
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/sessions`;
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(req.headers.get("authorization")
        ? { authorization: req.headers.get("authorization")! }
        : {}),
    },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  });
}
