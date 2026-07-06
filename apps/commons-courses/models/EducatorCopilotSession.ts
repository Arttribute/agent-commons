import mongoose, { Schema, Document } from "mongoose";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotAttachment,
  EducatorCopilotPageContext,
  EducatorCopilotToolActivity,
} from "@/types/educator-copilot";

export interface IEducatorCopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  attachments?: EducatorCopilotAttachment[];
  actions?: EducatorCopilotAction[];
  activity?: EducatorCopilotToolActivity[];
}

/** Full extracted text of an uploaded file, kept so the agent can re-read it later in the session. */
export interface IEducatorCopilotMaterial {
  name: string;
  type: string;
  size: number;
  text: string;
  fileId?: string;
  uploadedAt: Date;
}

export interface IEducatorCopilotSession extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  actionMode: EducatorCopilotActionMode;
  currentPath?: string;
  pageContext?: EducatorCopilotPageContext;
  messages: IEducatorCopilotMessage[];
  materials: IEducatorCopilotMaterial[];
  /** Agent Commons session id backing this chat (holds the model-side history). */
  agentSessionId?: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CopilotMessageSchema = new Schema<IEducatorCopilotMessage>(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    attachments: { type: [Schema.Types.Mixed], default: [] },
    actions: { type: [Schema.Types.Mixed], default: [] },
    activity: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const CopilotMaterialSchema = new Schema<IEducatorCopilotMaterial>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    text: { type: String, default: "" },
    fileId: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const EducatorCopilotSessionSchema = new Schema<IEducatorCopilotSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, default: "New copilot session" },
    actionMode: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
    currentPath: { type: String, trim: true },
    pageContext: { type: Schema.Types.Mixed },
    messages: { type: [CopilotMessageSchema], default: [] },
    materials: { type: [CopilotMaterialSchema], default: [] },
    agentSessionId: { type: String, trim: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

EducatorCopilotSessionSchema.index({ userId: 1, updatedAt: -1 });
EducatorCopilotSessionSchema.index({ userId: 1, archived: 1, updatedAt: -1 });

export default mongoose.models.EducatorCopilotSession ||
  mongoose.model<IEducatorCopilotSession>(
    "EducatorCopilotSession",
    EducatorCopilotSessionSchema
  );
