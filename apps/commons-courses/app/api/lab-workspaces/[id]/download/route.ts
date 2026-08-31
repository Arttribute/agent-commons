import { NextRequest, NextResponse } from "next/server";
import { authorizeLabWorkspace } from "@/lib/lab-workspace-access";
import { streamResponse } from "@/lib/lab-workspace-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await authorizeLabWorkspace(id);
  if (result.error) return result.error;
  const facilitator =
    request.nextUrl.searchParams.get("audience") === "facilitator";
  if (facilitator && !result.manages) {
    return NextResponse.json(
      { error: "Facilitator access required." },
      { status: 403 },
    );
  }
  const filename = facilitator
    ? result.workspace.sourceFileName
    : result.workspace.sourceFileName.replace(/\.zip$/i, "-learner.zip");
  return streamResponse(
    facilitator
      ? result.workspace.sourcePackGridFsId
      : result.workspace.learnerPackGridFsId,
    {
      filename,
      mimeType: "application/zip",
      size: facilitator
        ? result.workspace.sourcePackSize
        : result.workspace.learnerPackSize,
      download: true,
    },
  );
}
