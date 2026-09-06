import { Replayer } from "@rrweb/replay";
const channel = (window as any).__commonsCanvasChannel as string;
let player: Replayer | undefined;
let viewport = { width: 1280, height: 720 };
function fit() {
  const wrapper = document.querySelector<HTMLElement>(".replayer-wrapper");
  if (wrapper) {
    const scale = Math.min(
      innerWidth / viewport.width,
      innerHeight / viewport.height,
    );
    Object.assign(wrapper.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
      transform: `translate(-50%,-50%) scale(${scale})`,
      transformOrigin: "center",
    });
  }
}
window.addEventListener("resize", fit);
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
      const meta = event.data.events.find((e: any) => e.type === 4)?.data;
      if (meta?.width > 0 && meta?.height > 0)
        viewport = { width: meta.width, height: meta.height };
      player.pause(0);
      fit();
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
