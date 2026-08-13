export type CourseMaterialRecord = {
  id: string;
  courseId: string;
  courseSlug: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "presentation" | "pdf";
  visibility: "course" | "live";
  fileId: string;
  status: string;
  textPreview?: string;
  createdAt: string;
  updatedAt: string;
};
