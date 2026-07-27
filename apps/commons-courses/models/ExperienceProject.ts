import mongoose, { Document, Schema } from "mongoose";
import type { ExperienceDocument } from "@/types/experience";

export interface IExperienceProject extends Document {
  courseId: mongoose.Types.ObjectId;
  courseSlug: string;
  title: string;
  description: string;
  status: "draft" | "published";
  isFreePreview: boolean;
  draftVersion: number;
  draft: ExperienceDocument;
  publishedRevisionId?: mongoose.Types.ObjectId;
  publishedVersion?: number;
  publishedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceProjectSchema = new Schema<IExperienceProject>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    courseSlug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    isFreePreview: { type: Boolean, default: false },
    draftVersion: { type: Number, default: 1, min: 1 },
    draft: { type: Schema.Types.Mixed, required: true },
    publishedRevisionId: {
      type: Schema.Types.ObjectId,
      ref: "ExperienceRevision",
    },
    publishedVersion: Number,
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ExperienceProjectSchema.index({ courseId: 1, updatedAt: -1 });
ExperienceProjectSchema.index({ courseSlug: 1, status: 1 });
ExperienceProjectSchema.index({ publishedRevisionId: 1 });

const ExperienceProject =
  (mongoose.models.ExperienceProject as
    | mongoose.Model<IExperienceProject>
    | undefined) ||
  mongoose.model<IExperienceProject>(
    "ExperienceProject",
    ExperienceProjectSchema,
  );

export default ExperienceProject;
