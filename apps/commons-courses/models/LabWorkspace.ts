import mongoose, { Document, Schema } from "mongoose";
import type {
  LabWorkspaceAudience,
  LabWorkspaceVisibility,
} from "@/types/lab-workspace";

export interface ILabWorkspaceFile {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  audience: LabWorkspaceAudience;
  purpose?: string;
  editable: boolean;
  preview?: string;
  gridFsId: mongoose.Types.ObjectId;
}

export interface ILabWorkspace extends Document {
  courseId: mongoose.Types.ObjectId;
  courseSlug: string;
  ownerUserId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  instructions?: string;
  visibility: LabWorkspaceVisibility;
  sourceFileName: string;
  sourcePackGridFsId: mongoose.Types.ObjectId;
  sourcePackSize: number;
  learnerPackGridFsId: mongoose.Types.ObjectId;
  learnerPackSize: number;
  files: ILabWorkspaceFile[];
  createdAt: Date;
  updatedAt: Date;
}

const LabWorkspaceFileSchema = new Schema<ILabWorkspaceFile>(
  {
    id: { type: String, required: true, trim: true },
    path: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    audience: {
      type: String,
      enum: ["learner", "facilitator"],
      required: true,
    },
    purpose: { type: String, trim: true },
    editable: { type: Boolean, default: false },
    preview: String,
    gridFsId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const LabWorkspaceSchema = new Schema<ILabWorkspace>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    courseSlug: { type: String, required: true, trim: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    instructions: { type: String, trim: true },
    visibility: {
      type: String,
      enum: ["course", "live"],
      default: "course",
    },
    sourceFileName: { type: String, required: true, trim: true },
    sourcePackGridFsId: { type: Schema.Types.ObjectId, required: true },
    sourcePackSize: { type: Number, required: true, min: 0 },
    learnerPackGridFsId: { type: Schema.Types.ObjectId, required: true },
    learnerPackSize: { type: Number, required: true, min: 0 },
    files: { type: [LabWorkspaceFileSchema], default: [] },
  },
  { timestamps: true },
);

LabWorkspaceSchema.index({ courseId: 1, createdAt: -1 });
LabWorkspaceSchema.index({ courseSlug: 1, visibility: 1 });

export default mongoose.models.LabWorkspace ||
  mongoose.model<ILabWorkspace>("LabWorkspace", LabWorkspaceSchema);
