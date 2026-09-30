import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string } | string>;
export const TRANSCRIPTION_MODELS = ["Xenova/whisper-tiny", "Xenova/whisper-base", "Xenova/whisper-small"] as const;
let loaded: { model: string; promise: Promise<Transcriber> } | undefined;

async function getLocalTranscriber(userData: string, model: string): Promise<Transcriber> {
  if (!TRANSCRIPTION_MODELS.includes(model as typeof TRANSCRIPTION_MODELS[number])) throw new Error("Choose a supported speech model.");
  if (loaded?.model !== model) {
    const promise = (async () => {
      const { env, pipeline } = await import("@xenova/transformers");
      const cache = join(userData, "private-local", "transcription-models");
      mkdirSync(cache, { recursive: true, mode: 0o700 });
      env.cacheDir = cache;
      env.allowRemoteModels = true; // Downloads public model weights; audio stays local.
      return await pipeline("automatic-speech-recognition", model) as unknown as Transcriber;
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
