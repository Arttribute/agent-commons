import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  ensureVectorSearchIndex,
  listVectorSearchIndexes,
  vectorSearchDimensions,
  vectorSearchIndexName,
} from "@/lib/mongodb-vector-index";

function isAuthorized(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return Boolean(secret) && secret === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const indexes = await listVectorSearchIndexes();

  return NextResponse.json({
    expectedIndex: vectorSearchIndexName,
    expectedDimensions: vectorSearchDimensions,
    indexes,
    ready: indexes.some((index) => index.name === vectorSearchIndexName),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await connectDB();
    const result = await ensureVectorSearchIndex();
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not create MongoDB Vector Search index.";
    return NextResponse.json(
      {
        error: message,
        hint: "MongoDB Vector Search indexes require a deployment that supports MongoDB Search/Vector Search, such as Atlas or a compatible local deployment.",
      },
      { status: 500 }
    );
  }
}
