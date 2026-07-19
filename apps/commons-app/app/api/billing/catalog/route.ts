import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET() {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const res = await fetch(`${baseUrl}/v1/billing/catalog`, {
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), {
    status: res.status,
  });
}
