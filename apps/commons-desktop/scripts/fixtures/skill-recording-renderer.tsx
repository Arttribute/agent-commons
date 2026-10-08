import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useSkillRecording } from "../../../commons-app/lib/use-skill-recording";
import { recordingEvidence, recordingFilename } from "../../../commons-app/lib/skill-recording";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
let recording: ReturnType<typeof useSkillRecording>;
let currentContext = "account-a:local";
let renderNumber = 0;
const errors: Error[] = [];
const root = createRoot(document.getElementById("app")!);
function Capture() {
  recording = useSkillRecording(currentContext, (error) => errors.push(error), () => undefined);
  return <span>{renderNumber}:{String(recording.recording)}</span>;
}
function render() { flushSync(() => root.render(<Capture />)); }

async function main() {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360;
  const drawing = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    const phase = Math.min(2, Math.floor(frame++ / 6));
    drawing.fillStyle = ["#ff0000", "#0000ff", "#00aa00"][phase];
    drawing.fillRect(0, 0, 640, 360);
    drawing.fillStyle = "white"; drawing.font = "30px sans-serif";
    drawing.fillText(["Open reports", "Filter completed items", "Export report.csv"][phase], 40, 160);
  };
  draw();
  const animation = setInterval(draw, 100);
  const audio = new AudioContext();
  await audio.resume();
  const sources: MediaStream[] = [];
  const tone = (frequency: number) => {
    const oscillator = audio.createOscillator(); oscillator.frequency.value = frequency;
    const gain = audio.createGain(); gain.gain.value = 0.12;
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination); oscillator.start();
    return destination.stream;
  };
  Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { configurable: true, value: async () => {
    const stream = canvas.captureStream(12);
    stream.addTrack(tone(440).getAudioTracks()[0]); sources.push(stream); return stream;
  } });
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
    const stream = tone(880); sources.push(stream); return stream;
  } });
  try {
    render(); await pause(100);
    await recording!.startRecording(); await pause(100);
    check(recording!.recording, "Recording did not start");
    for (let index = 0; index < 8; index++) { renderNumber++; render(); await pause(170); check(recording!.recording, "A React render stopped recording"); }
    recording!.stopRecording();
    for (let index = 0; index < 50 && !recording!.capturedRecording; index++) await pause(50);
    const capture = recording!.capturedRecording;
    check(capture?.blob.size, "No encoded recording was saved");
    check(sources.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")), "Stopped recording leaked source tracks");
    const evidence = await recordingEvidence(capture!);
    check(evidence.frames.length === 4, "Video frames were not decoded");
    check(evidence.frames[3].timestampMs > capture!.durationMs * 0.8, "Ending of the recording was not sampled");
    check(evidence.samples?.length, "Mixed audio could not be decoded");
    const samples = evidence.samples!;
    const magnitude = (frequency: number) => {
      let real = 0, imaginary = 0;
      for (let index = 0; index < samples.length; index++) { const phase = 2 * Math.PI * frequency * index / 16000; real += samples[index] * Math.cos(phase); imaginary += samples[index] * Math.sin(phase); }
      return Math.hypot(real, imaginary) / samples.length;
    };
    check(magnitude(440) > 0.005 && magnitude(880) > 0.005, "System audio and microphone were not both present in the encoded clip");
    check(recordingFilename(new Blob([], { type: "video/mp4" })).endsWith(".mp4"), "MP4 was given a WebM extension");
    const stale = recording!.captureContext();
    await recording!.startRecording(); await pause(100);
    currentContext = "account-b:cloud"; render(); await pause(100);
    check(!recording!.recording && !recording!.capturedRecording, "Account/mode change retained a recording");
    check(sources.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")), "Account/mode change leaked media tracks");
    let rejected = false; try { stale(); } catch { rejected = true; }
    check(rejected, "Previous-account recording could be submitted");
    check(!errors.length, errors.map((error) => error.message).join("; "));
    const bytes = new Uint8Array(await capture!.blob.arrayBuffer());
    let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    (window as any).__recordingResult = { passed: true, bytes: bytes.length, durationMs: capture!.durationMs, frameTimes: evidence.frames.map((entry) => entry.timestampMs), systemAndMicrophone: true,
      recordingBase64: btoa(binary), frames: evidence.frames, mimeType: capture!.blob.type };
  } finally { clearInterval(animation); root.unmount(); await audio.close(); }
}
main().catch((error) => { (window as any).__recordingResult = { passed: false, error: error.stack || error.message }; });
