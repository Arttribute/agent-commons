import type { ILabWorkspace, ILabWorkspaceFile } from "@/models/LabWorkspace";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";

export function serializeLabWorkspace(
  workspace: ILabWorkspace,
  options: { educator?: boolean } = {},
): LabWorkspaceRecord {
  const files = (workspace.files || []).filter(
    (file) => options.educator || file.audience === "learner",
  );
  return {
    id: String(workspace._id),
    courseId: String(workspace.courseId),
    courseSlug: workspace.courseSlug,
    title: workspace.title,
    description: workspace.description,
    instructions: workspace.instructions,
    visibility: workspace.visibility,
    sourceFileName: workspace.sourceFileName,
    learnerFileCount: workspace.files.filter(
      (file) => file.audience === "learner",
    ).length,
    facilitatorFileCount: workspace.files.filter(
      (file) => file.audience === "facilitator",
    ).length,
    learnerPackSize: workspace.learnerPackSize,
    learnerPackDownloadUrl: `/api/lab-workspaces/${workspace._id}/download`,
    facilitatorPackDownloadUrl: options.educator
      ? `/api/lab-workspaces/${workspace._id}/download?audience=facilitator`
      : undefined,
    files: files.map((file) => serializeFile(workspace, file)),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

function serializeFile(workspace: ILabWorkspace, file: ILabWorkspaceFile) {
  const base = `/api/lab-workspaces/${workspace._id}/files/${file.id}`;
  return {
    id: file.id,
    path: file.path,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    audience: file.audience,
    purpose: file.purpose,
    editable: file.editable,
    preview: file.preview,
    url: base,
    downloadUrl: `${base}?download=1`,
  };
}
