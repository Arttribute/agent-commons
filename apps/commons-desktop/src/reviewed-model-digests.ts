// Manifest hashes checked against the official Ollama registry. These two
// reviewed releases are the automatic defaults; user-selected models remain
// available without being silently substituted for a default.
const REVIEWED_DEFAULT_DIGESTS: Record<string, string> = {
  "qwen3.5:2b": "324d162be6ca5629ae4517c8710434d0bd2d665bc94dbad46e9af8fbf8a2f0df",
  "qwen3:1.7b": "8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7",
};

export function assertReviewedModelDigest(model: string, digest: string | undefined) {
  const expected = REVIEWED_DEFAULT_DIGESTS[model];
  if (expected && digest !== expected) {
    throw new Error(`The installed ${model} differs from the reviewed default. Choose another installed model in General settings or update Agent Commons for a newer reviewed release.`);
  }
}
