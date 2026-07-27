import mongoose, { Document, Schema } from "mongoose";
import type { ExperienceDocument } from "@/types/experience";

export interface IExperienceRevision extends Document {
  projectId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  version: number;
  document: ExperienceDocument;
  contentHash: string;
  publishedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceRevisionSchema = new Schema<IExperienceRevision>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ExperienceProject",
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    version: { type: Number, required: true, min: 1 },
    document: { type: Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ExperienceRevisionSchema.index({ projectId: 1, version: -1 }, { unique: true });
ExperienceRevisionSchema.index({ courseId: 1, createdAt: -1 });

const ExperienceRevision =
  (mongoose.models.ExperienceRevision as
    | mongoose.Model<IExperienceRevision>
    | undefined) ||
  mongoose.model<IExperienceRevision>(
    "ExperienceRevision",
    ExperienceRevisionSchema,
  );

export default ExperienceRevision;
