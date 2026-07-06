import mongoose, { Schema, Document } from "mongoose";

export interface IEducatorCopilotPreference extends Document {
  userId: mongoose.Types.ObjectId;
  actionMode: "manual" | "auto";
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
  },
  { timestamps: true }
);

export default mongoose.models.EducatorCopilotPreference ||
  mongoose.model<IEducatorCopilotPreference>(
    "EducatorCopilotPreference",
    EducatorCopilotPreferenceSchema
  );
