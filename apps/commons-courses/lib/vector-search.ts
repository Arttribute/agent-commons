import mongoose from "mongoose";
import { contentHash, embedText } from "@/lib/embeddings";
import {
  courseEducatorsKey,
  courseEnrolledKey,
  coursePublicKey,
  learnerPrivateKey,
  type SearchScope,
} from "@/lib/search-access";
import SearchIndexItem from "@/models/SearchIndexItem";
import type {
  ScopedSearchResult,
  SearchMediaType,
  SearchSourceKind,
  SearchVisibility,
} from "@/types/vector-search";

export type IndexableSearchItem = {
  courseId: unknown;
  sourceKind: SearchSourceKind;
  sourceId: string;
  sourcePath?: string;
  mediaType?: SearchMediaType;
  mimeType?: string;
  title: string;
  text: string;
  url?: string;
  visibility: SearchVisibility;
  userId?: unknown;
  educatorId?: unknown;
  metadata?: Record<string, unknown>;
};

export async function upsertSearchIndexItem(input: IndexableSearchItem) {
  const text = input.text.trim();
  if (!text) return null;

  const { embedding, model } = await embedText(`${input.title}\n\n${text}`);
  const accessKeys = buildAccessKeys(input);
  const courseId = toObjectId(input.courseId);

  return SearchIndexItem.findOneAndUpdate(
    {
      courseId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourcePath: input.sourcePath || "",
    },
    {
      courseId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourcePath: input.sourcePath || "",
      mediaType: input.mediaType || "text",
      mimeType: input.mimeType,
      title: input.title,
      text,
      url: input.url,
      contentHash: contentHash(text),
      embedding,
      embeddingModel: model,
      visibility: input.visibility,
      accessKeys,
      userId: input.userId ? toObjectId(input.userId) : undefined,
      educatorId: input.educatorId ? toObjectId(input.educatorId) : undefined,
      metadata: input.metadata,
      indexedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true }
  );
}

export async function scopedVectorSearch({
  scope,
  query,
  limit = 6,
}: {
  scope: Extract<SearchScope, { ok: true }>;
  query: string;
  limit?: number;
}): Promise<ScopedSearchResult[]> {
  const { embedding } = await embedText(query);
  const match = {
    courseId: scope.courseId,
    accessKeys: { $in: scope.allowedAccessKeys },
  };

  try {
    const results = await SearchIndexItem.aggregate([
      {
        $vectorSearch: {
          index: process.env.MONGODB_VECTOR_SEARCH_INDEX || "course_content_vector",
          path: "embedding",
          queryVector: embedding,
          numCandidates: Math.max(limit * 12, 60),
          limit: Math.max(limit * 3, 20),
          filter: { accessKeys: { $in: scope.allowedAccessKeys } },
        },
      },
      { $match: match },
      {
        $project: {
          courseId: 1,
          sourceKind: 1,
          mediaType: 1,
          title: 1,
          text: 1,
          url: 1,
          metadata: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
      { $limit: limit },
    ]);

    return results.map(toSearchResult);
  } catch {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fallback = await SearchIndexItem.find({
      ...match,
      $or: [
        { title: { $regex: escaped, $options: "i" } },
        { text: { $regex: escaped, $options: "i" } },
      ],
    })
      .limit(limit)
      .lean();

    return fallback.map(toSearchResult);
  }
}

function buildAccessKeys(input: IndexableSearchItem) {
  const courseId = String(input.courseId);
  if (input.visibility === "course_public") return [coursePublicKey(courseId)];
  if (input.visibility === "course_enrolled") {
    return [coursePublicKey(courseId), courseEnrolledKey(courseId)];
  }
  if (input.visibility === "educator_private") {
    return [courseEducatorsKey(courseId)];
  }
  if (!input.userId) {
    throw new Error("learner_private search items require userId");
  }
  return [
    learnerPrivateKey(courseId, input.userId),
    courseEducatorsKey(courseId),
  ];
}

function toObjectId(value: unknown) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function toSearchResult(item: Record<string, unknown>): ScopedSearchResult {
  return {
    id: String(item._id),
    courseId: String(item.courseId),
    sourceKind: item.sourceKind as ScopedSearchResult["sourceKind"],
    mediaType: item.mediaType as ScopedSearchResult["mediaType"],
    title: String(item.title || ""),
    text: String(item.text || ""),
    url: typeof item.url === "string" ? item.url : undefined,
    score: typeof item.score === "number" ? item.score : undefined,
    metadata: item.metadata as Record<string, unknown> | undefined,
  };
}
