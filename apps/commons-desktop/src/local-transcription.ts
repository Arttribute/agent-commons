import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { WHISPER_REVISIONS, WHISPER_WEIGHT_FILES } from "./local-speech-model-revisions";
import { assertSpeechDownloadFits, repairSpeechArtifacts, verifySpeechArtifacts } from "./local-speech-model-cache";

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string } | string>;
export const TRANSCRIPTION_MODELS = Object.keys(WHISPER_REVISIONS) as Array<keyof typeof WHISPER_REVISIONS>;
let loaded: { model: string; promise: Promise<Transcriber> } | undefined;

async function getLocalTranscriber(userData: string, model: string): Promise<Transcriber> {
  if (!TRANSCRIPTION_MODELS.includes(model as typeof TRANSCRIPTION_MODELS[number])) throw new Error("Choose a supported speech model.");
  if (loaded?.model !== model) {
    const promise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const cache = join(userData, "private-local", "transcription-models");
      mkdirSync(cache, { recursive: true, mode: 0o700 });
      const revision = WHISPER_REVISIONS[model as keyof typeof WHISPER_REVISIONS];
      const artifacts = WHISPER_WEIGHT_FILES[model as keyof typeof WHISPER_WEIGHT_FILES]
        .map((weight) => ({ ...weight, model, revision }));
      await repairSpeechArtifacts(cache, artifacts);
      assertSpeechDownloadFits(cache, artifacts);
      // Downloads public model weights; audio stays local. Pass the cache per call so
      // simultaneous voice and transcription setup cannot switch each other's cache.
      const transcriber = await pipeline("automatic-speech-recognition", model, {
        revision,
        cache_dir: cache,
        // The pinned weights are the 8-bit `*_quantized.onnx` files.
        dtype: "q8",
      }) as unknown as Transcriber;
      await verifySpeechArtifacts(cache, artifacts);
      return transcriber;
    })().catch((error) => { if (loaded?.model === model) loaded = undefined; throw error; });
    loaded = { model, promise };
  }
  return loaded.promise;
}

/** Whisper runs entirely in the desktop process; recordings never go to Cloud. */
export async function prepareLocalTranscriber(userData: string, model: string = "Xenova/whisper-base") {
  await getLocalTranscriber(userData, model);
}

export async function transcribeLocalAudio(samples: Float32Array, userData: string, model = "Xenova/whisper-base") {
  if (!(samples instanceof Float32Array) || !samples.length || samples.length > 16000 * 120) {
    throw new Error("Recordings must be between a moment and two minutes long.");
  }
  const transcriber = await getLocalTranscriber(userData, model);
  const result = await transcriber(samples, { chunk_length_s: 30, stride_length_s: 5 });
  return (typeof result === "string" ? result : result.text ?? "").trim();
}
