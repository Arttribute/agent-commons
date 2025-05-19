import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/agents/run`;
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") || "application/json",
  };
  if (req.headers.get("authorization")) {
    headers["authorization"] = req.headers.get("authorization")!;
  }
  if (req.headers.get("x-initiator")) {
    headers["x-initiator"] = req.headers.get("x-initiator")!;
  }
  const res = await fetch(backendUrl, {
    method: "POST",
    headers,
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
