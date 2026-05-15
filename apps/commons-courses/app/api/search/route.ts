import { NextRequest, NextResponse } from "next/server";
import { buildSearchScope } from "@/lib/search-access";
import { scopedVectorSearch } from "@/lib/vector-search";
import type { SearchActorRole } from "@/types/vector-search";

export async function GET(req: NextRequest) {
  const courseSlug = req.nextUrl.searchParams.get("courseSlug");
  const query = req.nextUrl.searchParams.get("q");
  const role = (req.nextUrl.searchParams.get("role") || "learner") as
    | SearchActorRole
    | undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 6);

  if (!courseSlug || !query) {
    return NextResponse.json(
      { error: "courseSlug and q are required." },
      { status: 400 }
    );
  }

  const scope = await buildSearchScope({ courseSlug, role });
  if (!scope.ok) return scope.error;

  const results = await scopedVectorSearch({
    scope,
    query,
    limit: Math.min(Math.max(limit, 1), 12),
  });

  return NextResponse.json({ results });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    courseSlug?: string;
    query?: string;
    role?: SearchActorRole;
    limit?: number;
  };

  if (!body.courseSlug || !body.query) {
    return NextResponse.json(
      { error: "courseSlug and query are required." },
      { status: 400 }
    );
  }

  const scope = await buildSearchScope({
    courseSlug: body.courseSlug,
    role: body.role || "learner",
  });
  if (!scope.ok) return scope.error;

  const results = await scopedVectorSearch({
    scope,
    query: body.query,
    limit: Math.min(Math.max(body.limit || 6, 1), 12),
  });

  return NextResponse.json({ results });
}
