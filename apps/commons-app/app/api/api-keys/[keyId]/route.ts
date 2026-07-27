import { NextRequest, NextResponse } from "next/server";
import { identityPlatformFetch } from "@/lib/identity-platform";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  const response = await identityPlatformFetch(
    `/api-keys/${encodeURIComponent(keyId)}`,
    { method: "DELETE" },
  );
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const body = await response
    .json()
    .catch(() => ({ error: "Invalid identity response" }));
  return NextResponse.json(body, { status: response.status });
}
