import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import speakerVectors from "./speaker-vectors.json";

export const LOCAL_VOICES = [
  { id: "female", label: "SpeechT5 · female" },
  { id: "male", label: "SpeechT5 · male" },
  { id: "kokoro-heart", label: "Kokoro · Heart (US female)" },
  { id: "kokoro-bella", label: "Kokoro · Bella (US female)" },
  { id: "kokoro-michael", label: "Kokoro · Michael (US male)" },
  { id: "kokoro-george", label: "Kokoro · George (UK male)" },
] as const;
export type VoiceModelStatus = { state: "idle" | "downloading" | "ready" | "error"; label: string; model?: string; error?: string };
export type VoiceId = typeof LOCAL_VOICES[number]["id"];
type Synthesizer = (text: string, options: { speaker_embeddings: Float32Array }) => Promise<{ audio: Float32Array; sampling_rate: number }>;
type Kokoro = Awaited<ReturnType<typeof import("kokoro-js")["KokoroTTS"]["from_pretrained"]>>;
const KOKORO_VOICES = {
  "kokoro-heart": "af_heart",
  "kokoro-bella": "af_bella",
  "kokoro-michael": "am_michael",
  "kokoro-george": "bm_george",
} as const;

function wav(audio: Float32Array, sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000 || audio.length > sampleRate * 600) throw new Error("The voice model returned invalid audio.");
  const output = Buffer.allocUnsafe(44 + audio.length * 2);
  output.write("RIFF", 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(audio.length * 2, 40);
  for (let index = 0; index < audio.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(audio[index]) ? audio[index] : 0));
    output.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), 44 + index * 2);
  }
  return output;
}

function speechChunks(text: string) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 280) {
    const window = remaining.slice(0, 280);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
    const space = window.lastIndexOf(" ");
    const end = sentence >= 100 ? sentence + 1 : space >= 100 ? space : 280;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function joinAudio(chunks: Array<{ audio: Float32Array; sampling_rate: number }>) {
  const sampleRate = chunks[0]?.sampling_rate;
  if (!sampleRate || chunks.some((chunk) => !(chunk.audio instanceof Float32Array) || chunk.sampling_rate !== sampleRate)) {
    throw new Error("The voice model returned invalid audio.");
  }
  const silence = Math.round(sampleRate * 0.15);
  const length = chunks.reduce((sum, chunk) => sum + chunk.audio.length, 0) + silence * (chunks.length - 1);
  if (length > sampleRate * 600) throw new Error("Spoken audio is longer than 10 minutes. Use a shorter passage.");
  const audio = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { audio.set(chunk.audio, offset); offset += chunk.audio.length + silence; }
  return wav(audio, sampleRate);
}

/** Synthesis is local; only model weights are fetched on first use. */
export class LocalVoiceManager {
  private speechT5?: Promise<Synthesizer>;
  private kokoro?: Promise<Kokoro>;
  private status: VoiceModelStatus = { state: "idle", label: "Voice model downloads when first used" };
  constructor(private readonly userData: string, private readonly onStatus: (status: VoiceModelStatus) => void) {
    const cache = join(userData, "private-local", "voice-models", "Xenova");
    if (existsSync(join(cache, "speecht5_tts", "onnx", "encoder_model_quantized.onnx")) &&
        existsSync(join(cache, "speecht5_tts", "onnx", "decoder_model_merged_quantized.onnx")) &&
        existsSync(join(cache, "speecht5_hifigan", "onnx", "model.onnx"))) {
      this.status = { state: "ready", label: "Local voice model ready" };
    }
  }
  currentStatus() { return this.status; }
  private update(status: VoiceModelStatus) { this.status = status; this.onStatus(status); }
  async prepare(model: VoiceId = "female") {
    if (!LOCAL_VOICES.some((voice) => voice.id === model)) throw new Error("Choose a supported voice model.");
    if (model in KOKORO_VOICES) {
      if (!this.kokoro) {
        this.kokoro = (async () => {
          this.update({ state: "downloading", label: "Preparing Kokoro local voice model", model });
          const [{ env }, { KokoroTTS }] = await Promise.all([import("@huggingface/transformers"), import("kokoro-js")]);
          const cache = join(this.userData, "private-local", "voice-models", "kokoro");
          mkdirSync(cache, { recursive: true, mode: 0o700 });
          env.cacheDir = cache;
          env.allowRemoteModels = true;
          const synth = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
          this.update({ state: "ready", label: "Kokoro voice ready", model });
          return synth;
        })().catch((error) => {
          this.kokoro = undefined;
          this.update({ state: "error", label: "Kokoro voice unavailable", model, error: error instanceof Error ? error.message : String(error) });
          throw error;
        });
      }
      const synth = await this.kokoro;
      if (this.status.model !== model) this.update({ state: "ready", label: "Kokoro voice ready", model });
      return synth;
    }
    if (!this.speechT5) {
      this.speechT5 = (async () => {
        this.update({ state: "downloading", label: "Preparing local voice model", model });
        const { env, pipeline } = await import("@xenova/transformers");
        const cache = join(this.userData, "private-local", "voice-models");
        mkdirSync(cache, { recursive: true, mode: 0o700 });
        env.cacheDir = cache;
        env.allowRemoteModels = true;
        const synth = await pipeline("text-to-speech", "Xenova/speecht5_tts", { quantized: true }) as unknown as Synthesizer;
        this.update({ state: "ready", label: "Local voice model ready", model });
        return synth;
      })().catch((error) => {
        this.speechT5 = undefined;
        this.update({ state: "error", label: "Voice model unavailable", model, error: error instanceof Error ? error.message : String(error) });
        throw error;
      });
    }
    const synth = await this.speechT5;
    if (this.status.model !== model) this.update({ state: "ready", label: "Local voice model ready", model });
    return synth;
  }
  async generate(text: string, model: VoiceId = "female") {
    if (!text.trim() || text.length > 1_500) throw new Error("Speech text must be 1 to 1,500 characters.");
    if (model in KOKORO_VOICES) {
      const synth = await this.prepare(model) as Kokoro;
      const voice = KOKORO_VOICES[model as keyof typeof KOKORO_VOICES];
      const chunks = [];
      for (const passage of speechChunks(text)) chunks.push(await synth.generate(passage, { voice }));
      return joinAudio(chunks);
    }
    const synth = await this.prepare(model);
    const chunks = [];
    const speaker = Float32Array.from(speakerVectors[model as "female" | "male"]);
    for (const passage of speechChunks(text)) chunks.push(await (synth as Synthesizer)(passage, { speaker_embeddings: speaker }));
    return joinAudio(chunks);
  }
}
