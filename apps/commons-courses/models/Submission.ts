import mongoose, { Schema, Document } from "mongoose";

export interface ISubmission extends Document {
  assignmentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text?: string;
  url?: string;
  status: "submitted" | "reviewed" | "returned";
  score?: number;
  feedback?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubmissionSchema = new Schema<ISubmission>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: String,
    url: String,
    status: {
      type: String,
      enum: ["submitted", "reviewed", "returned"],
      default: "submitted",
    },
    score: Number,
    feedback: String,
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
  },
  { timestamps: true }
);

SubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });
SubmissionSchema.index({ courseId: 1, submittedAt: -1 });

export default mongoose.models.Submission ||
  mongoose.model<ISubmission>("Submission", SubmissionSchema);
