import mongoose, { Schema, Document } from "mongoose";

export interface IAssignment extends Document {
  courseId: mongoose.Types.ObjectId;
  educatorId: mongoose.Types.ObjectId;
  title: string;
  instructions: string;
  moduleIndex?: number;
  lessonIndex?: number;
  dueAt?: Date;
  points: number;
  acceptsText: boolean;
  acceptsUrl: boolean;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, required: true },
    moduleIndex: Number,
    lessonIndex: Number,
    dueAt: Date,
    points: { type: Number, default: 100, min: 0 },
    acceptsText: { type: Boolean, default: true },
    acceptsUrl: { type: Boolean, default: true },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AssignmentSchema.index({ courseId: 1, moduleIndex: 1, lessonIndex: 1 });

export default mongoose.models.Assignment ||
  mongoose.model<IAssignment>("Assignment", AssignmentSchema);
