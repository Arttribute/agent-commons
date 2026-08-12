import mongoose, { Document, Schema } from "mongoose";

export interface ILiveResponse extends Document {
  sessionId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  activityId: string;
  participantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  value: string | string[];
  correct?: boolean;
  pointsAwarded: number;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LiveResponseSchema = new Schema<ILiveResponse>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "LiveSession",
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    activityId: { type: String, required: true, trim: true },
    participantId: {
      type: Schema.Types.ObjectId,
      ref: "LiveParticipant",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Schema.Types.Mixed, required: true },
    correct: Boolean,
    pointsAwarded: { type: Number, default: 0, min: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

LiveResponseSchema.index(
  { sessionId: 1, activityId: 1, participantId: 1 },
  { unique: true },
);
LiveResponseSchema.index({ sessionId: 1, activityId: 1, submittedAt: -1 });

export default mongoose.models.LiveResponse ||
  mongoose.model<ILiveResponse>("LiveResponse", LiveResponseSchema);

