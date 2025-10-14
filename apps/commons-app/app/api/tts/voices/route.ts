import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = (searchParams.get("provider") || "openai") as
    | "openai"
    | "elevenlabs";
  const q = searchParams.get("q") || undefined;
  try {
  const url = new URL(`${baseUrl}/v1/agents/tts/voices`);
    url.searchParams.set("provider", provider);
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch voices" },
      { status: 500 }
    );
  }
}
