import mongoose, { Document, Schema } from "mongoose";

export interface ICourseMaterial extends Document {
  courseId: mongoose.Types.ObjectId;
  courseSlug: string;
  ownerUserId: mongoose.Types.ObjectId;
  ownerPrincipalId: string;
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "presentation" | "pdf";
  visibility: "course" | "live";
  status: string;
  textPreview?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CourseMaterialSchema = new Schema<ICourseMaterial>({
  courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
  courseSlug: { type: String, required: true, trim: true },
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  ownerPrincipalId: { type: String, required: true, trim: true },
  fileId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  mimeType: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 0 },
  kind: { type: String, enum: ["presentation", "pdf"], required: true },
  visibility: { type: String, enum: ["course", "live"], default: "course" },
  status: { type: String, default: "uploaded" },
  textPreview: String,
}, { timestamps: true });

CourseMaterialSchema.index({ courseId: 1, createdAt: -1 });
CourseMaterialSchema.index({ fileId: 1 }, { unique: true });

export default mongoose.models.CourseMaterial ||
  mongoose.model<ICourseMaterial>("CourseMaterial", CourseMaterialSchema);
