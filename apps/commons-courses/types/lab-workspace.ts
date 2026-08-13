export type LabWorkspaceVisibility = "course" | "live";
export type LabWorkspaceAudience = "learner" | "facilitator";

export type LabWorkspaceFileRecord = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  audience: LabWorkspaceAudience;
  purpose?: string;
  editable: boolean;
  preview?: string;
  url: string;
  downloadUrl: string;
};

export type LabWorkspaceRecord = {
  id: string;
  courseId: string;
  courseSlug: string;
  title: string;
  description?: string;
  instructions?: string;
  visibility: LabWorkspaceVisibility;
  sourceFileName: string;
  learnerFileCount: number;
  facilitatorFileCount: number;
  learnerPackSize: number;
  learnerPackDownloadUrl: string;
  facilitatorPackDownloadUrl?: string;
  files: LabWorkspaceFileRecord[];
  createdAt: string;
  updatedAt: string;
};
