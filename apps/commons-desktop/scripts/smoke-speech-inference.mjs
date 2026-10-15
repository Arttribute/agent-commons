import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { LocalVoiceManager } = require(join(appDir, ".speech-smoke", "local-voice.cjs"));
const { transcribeLocalAudio } = require(join(appDir, ".speech-smoke", "local-transcription.cjs"));
const storage = mkdtempSync(join(tmpdir(), "commons-speech-inference-"));

try {
  const voice = new LocalVoiceManager(storage, () => {});
  // SpeechT5 synthesis varies between calls. Repeat the round trip so a lucky
  // intelligible sample cannot hide a precision regression.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const wav = await voice.generate("The sky is blue today. This is an Agent Commons test.", "female");
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt32LE(24), 16_000, "SpeechT5 output must be 16 kHz for local transcription");
    assert.ok(wav.length > 44 + 16_000, "The voice model returned too little audio");
    const samples = new Float32Array((wav.length - 44) / 2);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = wav.readInt16LE(44 + index * 2) / 32768;
    }
    const transcript = await transcribeLocalAudio(samples, storage, "Xenova/whisper-base");
    assert.match(transcript.toLowerCase(), /\b(?:sky|skies)\b/, `Local transcription missed the subject: ${transcript}`);
    assert.match(transcript.toLowerCase(), /\b(?:blue|blew)\b/, `Local transcription missed the spoken phrase: ${transcript}`);
    console.log(`Verified local voice and transcription inference ${attempt}/3 on ${process.platform}-${process.arch}: ${transcript}`);
  }
} finally {
  rmSync(storage, { recursive: true, force: true });
  rmSync(join(appDir, ".speech-smoke"), { recursive: true, force: true });
}
