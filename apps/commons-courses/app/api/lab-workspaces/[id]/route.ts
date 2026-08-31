import { NextRequest, NextResponse } from "next/server";
import { authorizeLabWorkspace } from "@/lib/lab-workspace-access";
import { serializeLabWorkspace } from "@/lib/lab-workspace-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await authorizeLabWorkspace(id);
  if (result.error) return result.error;
  return NextResponse.json(
    {
      workspace: serializeLabWorkspace(result.workspace, {
        educator: result.manages,
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
