import { Replayer } from "@rrweb/replay";
const channel = (window as any).__commonsCanvasChannel as string;
let player: Replayer | undefined;
window.addEventListener("message", (event) => {
  if (event.source !== parent || event.data?.channel !== channel) return;
  try {
    if (event.data.command === "load") {
      player?.destroy();
      player = new Replayer(event.data.events, {
        root: document.body,
        UNSAFE_replayCanvas: true,
        showWarning: false,
        showDebug: false,
        mouseTail: false,
      });
      player.pause(0);
    } else if (event.data.command === "seek") player?.pause(event.data.timeMs);
    else if (event.data.command === "play")
      player?.play(event.data.timeMs ?? 0);
    else if (event.data.command === "pause") player?.pause();
  } catch (error) {
    parent.postMessage(
      { channel, type: "replay-error", error: String(error) },
      "*",
    );
  }
});
parent.postMessage({ channel, type: "replay-ready" }, "*");
