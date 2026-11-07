import { NextResponse } from "next/server";
import { fetchPublicProjectPage } from "@/lib/public-project-page";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const page = await fetchPublicProjectPage((await params).slug);
  return NextResponse.json(
    page ? { data: page } : { error: "Page not found" },
    { status: page ? 200 : 404, headers: { "Cache-Control": "no-store" } },
  );
}
