import mongoose, { Schema, Document } from "mongoose";
import type {
  SearchMediaType,
  SearchSourceKind,
  SearchVisibility,
} from "@/types/vector-search";

export interface ISearchIndexItem extends Document {
  courseId: mongoose.Types.ObjectId;
  sourceKind: SearchSourceKind;
  sourceId: string;
  sourcePath?: string;
  mediaType: SearchMediaType;
  mimeType?: string;
  title: string;
  text: string;
  url?: string;
  contentHash: string;
  embedding: number[];
  embeddingModel: string;
  visibility: SearchVisibility;
  accessKeys: string[];
  userId?: mongoose.Types.ObjectId;
  educatorId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  indexedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SearchIndexItemSchema = new Schema<ISearchIndexItem>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    sourceKind: {
      type: String,
      enum: [
        "course",
        "module",
        "lesson",
        "assignment",
        "submission",
        "feedback",
        "resource",
      ],
      required: true,
    },
    sourceId: { type: String, required: true },
    sourcePath: String,
    mediaType: {
      type: String,
      enum: ["text", "image", "audio", "video", "pdf", "document", "url"],
      default: "text",
    },
    mimeType: String,
    title: { type: String, required: true },
    text: { type: String, required: true },
    url: String,
    contentHash: { type: String, required: true },
    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
    visibility: {
      type: String,
      enum: [
        "course_public",
        "course_enrolled",
        "educator_private",
        "learner_private",
      ],
      required: true,
    },
    accessKeys: { type: [String], required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    educatorId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: Schema.Types.Mixed,
    indexedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SearchIndexItemSchema.index(
  { courseId: 1, sourceKind: 1, sourceId: 1, sourcePath: 1 },
  { unique: true }
);
SearchIndexItemSchema.index({ courseId: 1, visibility: 1 });
SearchIndexItemSchema.index({ userId: 1, courseId: 1 });
SearchIndexItemSchema.index({ title: "text", text: "text" });

export default mongoose.models.SearchIndexItem ||
  mongoose.model<ISearchIndexItem>("SearchIndexItem", SearchIndexItemSchema);
