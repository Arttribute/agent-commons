import mongoose, { Document, Schema } from "mongoose";

export interface ILiveParticipant extends Document {
  sessionId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  displayName: string;
  email: string;
  status: "joined" | "active" | "completed";
  joinedAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LiveParticipantSchema = new Schema<ILiveParticipant>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "LiveSession",
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ["joined", "active", "completed"],
      default: "joined",
    },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

LiveParticipantSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
LiveParticipantSchema.index({ sessionId: 1, lastSeenAt: -1 });

export default mongoose.models.LiveParticipant ||
  mongoose.model<ILiveParticipant>("LiveParticipant", LiveParticipantSchema);

