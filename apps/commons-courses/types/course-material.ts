export type CourseMaterialRecord = {
  id: string;
  courseId: string;
  courseSlug: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "presentation" | "pdf";
  visibility: "course" | "live" | "educator";
  fileId?: string;
  storage: "commons" | "gridfs";
  status: string;
  textPreview?: string;
  createdAt: string;
  updatedAt: string;
};
