import SearchIndexItem from "@/models/SearchIndexItem";

export const vectorSearchIndexName =
  process.env.MONGODB_VECTOR_SEARCH_INDEX || "course_content_vector";

export const vectorSearchDimensions = Number(
  process.env.VECTOR_EMBEDDING_DIMENSIONS || 1536
);

export async function listVectorSearchIndexes() {
  const collection = SearchIndexItem.collection;
  const listSearchIndexes = collection.listSearchIndexes?.bind(collection);
  if (!listSearchIndexes) return [];

  return listSearchIndexes().toArray();
}

export async function ensureVectorSearchIndex() {
  await SearchIndexItem.createCollection();
  const collection = SearchIndexItem.collection;
  const existing = await listVectorSearchIndexes();
  const found = existing.find((index) => index.name === vectorSearchIndexName);
  if (found) {
    return { created: false, index: found };
  }

  const definition = {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: vectorSearchDimensions,
        similarity: "cosine",
      },
      { type: "filter", path: "courseId" },
      { type: "filter", path: "accessKeys" },
      { type: "filter", path: "sourceKind" },
      { type: "filter", path: "mediaType" },
    ],
  };

  const createSearchIndex = collection.createSearchIndex?.bind(collection);
  if (!createSearchIndex) {
    throw new Error("MongoDB driver does not support createSearchIndex().");
  }

  const result = await createSearchIndex({
    name: vectorSearchIndexName,
    type: "vectorSearch",
    definition,
  });

  return {
    created: true,
    index: {
      name: vectorSearchIndexName,
      type: "vectorSearch",
      definition,
      result,
    },
  };
}
