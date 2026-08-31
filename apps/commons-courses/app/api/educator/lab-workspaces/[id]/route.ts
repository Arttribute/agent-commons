import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { authorizeLabWorkspace } from "@/lib/lab-workspace-access";
import { serializeLabWorkspace } from "@/lib/lab-workspace-data";
import { deleteLabFiles } from "@/lib/lab-workspace-storage";
import type { ILabWorkspaceFile } from "@/models/LabWorkspace";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await authorizeLabWorkspace(id);
  if (result.error) return result.error;
  if (!result.manages)
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.json();
  if (typeof body.title === "string" && body.title.trim()) {
    result.workspace.title = body.title.trim().slice(0, 140);
  }
  if (typeof body.description === "string") {
    result.workspace.description =
      body.description.trim().slice(0, 1200) || undefined;
  }
  if (typeof body.instructions === "string") {
    result.workspace.instructions =
      body.instructions.trim().slice(0, 5000) || undefined;
  }
  if (body.visibility === "course" || body.visibility === "live") {
    result.workspace.visibility = body.visibility;
  }
  await result.workspace.save();
  return NextResponse.json({
    workspace: serializeLabWorkspace(result.workspace, { educator: true }),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json(
      { error: "Lab workspace not found." },
      { status: 404 },
    );
  }
  const result = await authorizeLabWorkspace(id);
  if (result.error) return result.error;
  if (!result.manages)
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const storageIds = [
    result.workspace.sourcePackGridFsId,
    result.workspace.learnerPackGridFsId,
    ...result.workspace.files.map((file: ILabWorkspaceFile) => file.gridFsId),
  ];
  await result.workspace.deleteOne();
  await deleteLabFiles(storageIds);
  return NextResponse.json({ ok: true });
}
