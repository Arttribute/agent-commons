import mongoose, { Document, Schema } from "mongoose";
import type {
  LearnerDomain,
  LearnerFormat,
  LearnerGuidanceStyle,
} from "@/types/learner-profile";
import {
  learnerDomains,
  learnerFormats,
  learnerGuidanceStyles,
} from "@/types/learner-profile";

export interface ILearnerProfile extends Document {
  userId: mongoose.Types.ObjectId;
  personalizationEnabled: boolean;
  onboardingCompleted: boolean;
  roleOrContext: string;
  domain?: LearnerDomain;
  interests: string[];
  goals: string[];
  preferredFormats: LearnerFormat[];
  guidanceStyle: LearnerGuidanceStyle;
  customContext: string;
  allowUsageLearning: boolean;
  usageSignals: {
    contextualExampleViews: number;
    mindMapViews: number;
    audioStarts: number;
    helpfulMarks: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const LearnerProfileSchema = new Schema<ILearnerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    personalizationEnabled: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
    roleOrContext: { type: String, trim: true, maxlength: 120, default: "" },
    domain: { type: String, enum: [...learnerDomains], default: undefined },
    interests: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
    },
    goals: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      default: [],
    },
    preferredFormats: {
      type: [{ type: String, enum: [...learnerFormats] }],
      default: ["examples", "mind_maps"],
    },
    guidanceStyle: {
      type: String,
      enum: [...learnerGuidanceStyles],
      default: "coach_me",
    },
    customContext: { type: String, trim: true, maxlength: 500, default: "" },
    allowUsageLearning: { type: Boolean, default: true },
    usageSignals: {
      contextualExampleViews: { type: Number, min: 0, default: 0 },
      mindMapViews: { type: Number, min: 0, default: 0 },
      audioStarts: { type: Number, min: 0, default: 0 },
      helpfulMarks: { type: Number, min: 0, default: 0 },
    },
  },
  { timestamps: true },
);

export default mongoose.models.LearnerProfile ||
  mongoose.model<ILearnerProfile>("LearnerProfile", LearnerProfileSchema);
