import type { ICourseMaterial } from "@/models/CourseMaterial";
import type { CourseMaterialRecord } from "@/types/course-material";

export function serializeCourseMaterial(material: ICourseMaterial): CourseMaterialRecord {
  return {
    id: String(material._id),
    courseId: String(material.courseId),
    courseSlug: material.courseSlug,
    name: material.name,
    mimeType: material.mimeType,
    size: material.size,
    kind: material.kind,
    visibility: material.visibility,
    fileId: material.fileId,
    storage: material.storage || "commons",
    status: material.status,
    textPreview: material.textPreview,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
  };
}
