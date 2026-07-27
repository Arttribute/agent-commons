import mongoose, { Document, Schema } from "mongoose";

export interface IExperienceProgress extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  revisionId: mongoose.Types.ObjectId;
  revisionVersion: number;
  currentSceneId: string;
  completedSceneIds: string[];
  score: number;
  attempts: Map<string, number>;
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceProgressSchema = new Schema<IExperienceProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ExperienceProject",
      required: true,
    },
    revisionId: {
      type: Schema.Types.ObjectId,
      ref: "ExperienceRevision",
      required: true,
    },
    revisionVersion: { type: Number, required: true },
    currentSceneId: { type: String, required: true },
    completedSceneIds: { type: [String], default: [] },
    score: { type: Number, default: 0, min: 0 },
    attempts: { type: Map, of: Number, default: {} },
    completed: { type: Boolean, default: false },
    completedAt: Date,
  },
  { timestamps: true },
);

ExperienceProgressSchema.index(
  { userId: 1, projectId: 1 },
  { unique: true },
);
ExperienceProgressSchema.index({ courseId: 1, completed: 1, updatedAt: -1 });

const ExperienceProgress =
  (mongoose.models.ExperienceProgress as
    | mongoose.Model<IExperienceProgress>
    | undefined) ||
  mongoose.model<IExperienceProgress>(
    "ExperienceProgress",
    ExperienceProgressSchema,
  );

export default ExperienceProgress;
