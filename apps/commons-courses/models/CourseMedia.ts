import mongoose, { Schema, Document } from "mongoose";

export interface ICourseMedia extends Document {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CourseMediaSchema = new Schema<ICourseMedia>(
  {
    filename: { type: String, required: true, trim: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, max: 4 * 1024 * 1024 },
    data: { type: Buffer, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CourseMediaSchema.index({ uploadedBy: 1, createdAt: -1 });

export default mongoose.models.CourseMedia ||
  mongoose.model<ICourseMedia>("CourseMedia", CourseMediaSchema);
