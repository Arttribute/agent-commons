import mongoose, { Schema, Document } from "mongoose";

/**
 * Per-educator copilot profile. Each educator gets their own Agent Commons
 * agent instance (agentId) so instructions, model, memory, and connectors are
 * personal to them.
 */
export interface IEducatorCopilotPreference extends Document {
  userId: mongoose.Types.ObjectId;
  actionMode: "manual" | "auto";
  agentId?: string;
  /** Commons Identity principal that owns the dedicated agent. */
  agentOwnerId?: string;
  copilotName?: string;
  customInstructions?: string;
  modelProvider?: string;
  modelId?: string;
  /** Hash of the provisioning inputs so we only push agent updates on change. */
  agentConfigFingerprint?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EducatorCopilotPreferenceSchema = new Schema<IEducatorCopilotPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    actionMode: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
    agentId: { type: String, trim: true },
    agentOwnerId: { type: String, trim: true },
    copilotName: { type: String, trim: true },
    customInstructions: { type: String, trim: true, maxlength: 6000 },
    modelProvider: { type: String, trim: true },
    modelId: { type: String, trim: true },
    agentConfigFingerprint: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.EducatorCopilotPreference ||
  mongoose.model<IEducatorCopilotPreference>(
    "EducatorCopilotPreference",
    EducatorCopilotPreferenceSchema
  );
