import { NextRequest, NextResponse } from "next/server";
import { authorizeLabWorkspace } from "@/lib/lab-workspace-access";
import { streamResponse } from "@/lib/lab-workspace-storage";
import type { ILabWorkspaceFile } from "@/models/LabWorkspace";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const result = await authorizeLabWorkspace(id);
  if (result.error) return result.error;
  const file = result.workspace.files.find(
    (item: ILabWorkspaceFile) => item.id === fileId,
  );
  if (!file || (file.audience === "facilitator" && !result.manages)) {
    return NextResponse.json({ error: "Lab file not found." }, { status: 404 });
  }
  return streamResponse(file.gridFsId, {
    filename: file.name,
    mimeType: file.mimeType,
    size: file.size,
    download: request.nextUrl.searchParams.get("download") === "1",
  });
}
