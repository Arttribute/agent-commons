import mongoose, { Schema, Document } from "mongoose";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

export interface IEducatorCopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  actions?: EducatorCopilotAction[];
}

export interface IEducatorCopilotSession extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  actionMode: EducatorCopilotActionMode;
  currentPath?: string;
  pageContext?: EducatorCopilotPageContext;
  messages: IEducatorCopilotMessage[];
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
    actions: { type: [Schema.Types.Mixed], default: [] },
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
