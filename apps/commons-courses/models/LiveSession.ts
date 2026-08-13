import mongoose, { Document, Schema } from "mongoose";
import type {
  LiveActivity,
  LiveSessionAccess,
  LiveSessionPace,
  LiveSessionSettings,
  LiveSessionStatus,
} from "@/types/live-session";

export interface ILiveSession extends Document {
  courseId: mongoose.Types.ObjectId;
  courseSlug: string;
  title: string;
  description?: string;
  joinCode: string;
  status: LiveSessionStatus;
  pace: LiveSessionPace;
  access: LiveSessionAccess;
  invitedEmails: string[];
  scheduledStart?: Date;
  currentActivityId?: string;
  stateVersion: number;
  activities: LiveActivity[];
  settings: LiveSessionSettings;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LiveActivityOptionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const LiveActivitySchema = new Schema<LiveActivity>(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "content",
        "setup_check",
        "poll",
        "quiz",
        "reflection",
        "task",
        "break",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    prompt: { type: String, trim: true },
    instructions: { type: String, trim: true },
    successCriteria: { type: String, trim: true },
    facilitatorNotes: { type: String, trim: true },
    resourceUrl: { type: String, trim: true },
    materialId: { type: String, trim: true },
    estimatedMinutes: { type: Number, min: 1, max: 480 },
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
    },
    required: { type: Boolean, default: false },
    randomizeOptions: { type: Boolean, default: false },
    showResults: { type: Boolean, default: false },
    points: { type: Number, default: 0, min: 0 },
    options: { type: [LiveActivityOptionSchema], default: [] },
  },
  { _id: false },
);

const LiveSessionSettingsSchema = new Schema<LiveSessionSettings>(
  {
    allowLateJoin: { type: Boolean, default: true },
    showParticipantNames: { type: Boolean, default: false },
    showLeaderboard: { type: Boolean, default: false },
  },
  { _id: false },
);

const LiveSessionSchema = new Schema<ILiveSession>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    courseSlug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    joinCode: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: ["draft", "lobby", "live", "ended"],
      default: "draft",
    },
    pace: {
      type: String,
      enum: ["facilitator", "learner"],
      default: "facilitator",
    },
    access: {
      type: String,
      enum: ["enrolled", "invited", "open"],
      default: "enrolled",
    },
    invitedEmails: { type: [String], default: [] },
    scheduledStart: Date,
    currentActivityId: String,
    stateVersion: { type: Number, default: 0, min: 0 },
    activities: { type: [LiveActivitySchema], default: [] },
    settings: { type: LiveSessionSettingsSchema, default: () => ({}) },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

LiveSessionSchema.index({ courseId: 1, createdAt: -1 });
LiveSessionSchema.index({ courseSlug: 1, status: 1 });
LiveSessionSchema.index({ status: 1, scheduledStart: 1 });

export default mongoose.models.LiveSession ||
  mongoose.model<ILiveSession>("LiveSession", LiveSessionSchema);
