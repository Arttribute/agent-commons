import mongoose, { Schema, Document } from "mongoose";
import type { CheckInContextSource } from "@/lib/check-in-context";

export type AssignmentTargetContext = {
  userId: mongoose.Types.ObjectId;
  context: string;
  source?: CheckInContextSource;
};

export type AssignmentMeetingSlot = {
  id: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  capacity: number;
};

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
  kind: "coursework" | "follow_up";
  sourceLiveSessionId?: mongoose.Types.ObjectId;
  targetUserIds: mongoose.Types.ObjectId[];
  targetContexts: AssignmentTargetContext[];
  checkInKey?: string;
  meetingSlots: AssignmentMeetingSlot[];
  meetingSlotRequired: boolean;
  context?: string;
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
    kind: {
      type: String,
      enum: ["coursework", "follow_up"],
      default: "coursework",
    },
    sourceLiveSessionId: { type: Schema.Types.ObjectId, ref: "LiveSession" },
    targetUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    targetContexts: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        context: { type: String, required: true, trim: true, maxlength: 12_000 },
        source: {
          type: String,
          enum: [
            "manual",
            "outcome_contract",
            "chosen_focus",
            "commitment",
            "reflection",
            "not_captured",
          ],
        },
      },
    ],
    checkInKey: { type: String, trim: true },
    meetingSlots: [
      {
        _id: false,
        id: { type: String, required: true, trim: true },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        timezone: { type: String, required: true, default: "Africa/Nairobi" },
        capacity: { type: Number, min: 1, default: 1 },
      },
    ],
    meetingSlotRequired: { type: Boolean, default: false },
    context: { type: String, trim: true, maxlength: 12_000 },
  },
  { timestamps: true }
);

AssignmentSchema.index({ courseId: 1, moduleIndex: 1, lessonIndex: 1 });
AssignmentSchema.index({ courseId: 1, kind: 1, createdAt: -1 });
AssignmentSchema.index(
  { courseId: 1, checkInKey: 1 },
  { unique: true, sparse: true },
);

export default mongoose.models.Assignment ||
  mongoose.model<IAssignment>("Assignment", AssignmentSchema);
