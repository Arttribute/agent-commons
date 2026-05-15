import crypto from "crypto";

export type EmbeddingResult = {
  embedding: number[];
  model: string;
};

const defaultDimensions = Number(process.env.VECTOR_EMBEDDING_DIMENSIONS || 1536);

export async function embedText(text: string): Promise<EmbeddingResult> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 24000),
      }),
    });

    if (!res.ok) {
      throw new Error("Embedding request failed");
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      model?: string;
    };
    const embedding = data.data?.[0]?.embedding;
    if (embedding?.length) {
      return { embedding, model: data.model || model };
    }
  }

  return {
    embedding: deterministicEmbedding(text, defaultDimensions),
    model: `deterministic-local-${defaultDimensions}`,
  };
}

export function contentHash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function deterministicEmbedding(text: string, dimensions: number) {
  const values = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];

  for (const token of tokens) {
    const hash = crypto.createHash("sha256").update(token).digest();
    for (let i = 0; i < hash.length; i += 2) {
      const index = hash[i] % dimensions;
      values[index] += hash[i + 1] > 127 ? 1 : -1;
    }
  }

  const magnitude =
    Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / magnitude);
}
