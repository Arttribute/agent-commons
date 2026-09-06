import { record } from "@rrweb/record";

const channel = (window as any).__commonsCanvasChannel as string;
let stop: (() => void) | undefined;
let recordingStarted = 0;
let bytes = 0;
let sequence = 0;
const send = (type: string, payload: unknown) =>
  parent.postMessage({ channel, type, payload }, "*");
function observe() {
  const bridge = (window as any).arcade;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button,[role="button"],input[type="button"]',
    ),
  )
    .filter((e) => !e.hasAttribute("disabled"))
    .slice(0, 80);
  elements.forEach(
    (element, index) => (element.dataset.commonsAction = String(index)),
  );
  const custom = bridge?.actions?.();
  const actions = Array.isArray(custom)
    ? custom
        .slice(0, 80)
        .filter((a) => typeof a.id === "string" && typeof a.label === "string")
        .map((a) => ({ id: a.id.slice(0, 100), label: a.label.slice(0, 200) }))
    : elements.map((e, i) => ({
        id: `click:${i}`,
        label: (e.getAttribute("aria-label") || e.textContent || "Button")
          .trim()
          .slice(0, 200),
      }));
  const state = bridge?.observe?.() ?? {
    text: document.body.innerText.slice(0, 8000),
  };
  const serialized = JSON.stringify({ state, actions });
  if (serialized.length > 24000) throw Error("Game observation exceeds 24 KB.");
  return JSON.parse(serialized);
}
window.addEventListener("message", async (event) => {
  if (event.source !== parent || event.data?.channel !== channel) return;
  const { requestId, command, payload } = event.data;
  try {
    let result: unknown;
    if (command === "observe") result = observe();
    else if (command === "act") {
      const observation = observe();
      if (!observation.actions.some((a: any) => a.id === payload?.id))
        throw Error("Action is not available in this observation.");
      const bridge = (window as any).arcade;
      if (bridge?.step) await bridge.step(payload.id);
      else
        document
          .querySelector<HTMLElement>(
            `[data-commons-action="${payload.id.slice(6)}"]`,
          )
          ?.click();
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
      result = observe();
    } else if (command === "record-start") {
      stop?.();
      bytes = 0;
      sequence = 0;
      recordingStarted = Date.now();
      stop = record({
        recordCanvas: true,
        inlineImages: true,
        maskAllInputs: true,
        sampling: { canvas: 10, mousemove: 100 },
        dataURLOptions: { type: "image/webp", quality: 0.6 },
        emit(event) {
          const size = JSON.stringify(event).length;
          if (
            bytes + size > 8 * 1024 * 1024 ||
            Date.now() - recordingStarted > 5 * 60 * 1000
          ) {
            stop?.();
            stop = undefined;
            send("record-limit", {
              reason: "Recording reached its five-minute or 8 MB limit.",
            });
            return;
          }
          bytes += size;
          send("record-event", { event, sequence: sequence++ });
        },
      });
      result = { startedAt: recordingStarted };
    } else if (command === "record-stop") {
      stop?.();
      stop = undefined;
      result = { durationMs: Date.now() - recordingStarted };
    } else throw Error("Unknown canvas command.");
    send("response", { requestId, result });
  } catch (error) {
    send("response", {
      requestId,
      error: error instanceof Error ? error.message : "Canvas command failed.",
    });
  }
});
for (const type of ["click", "keydown"] as const)
  document.addEventListener(
    type,
    (event) => {
      const target = event.target as HTMLElement;
      if (
        type === "keydown" &&
        ![
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Escape",
          "Enter",
          " ",
        ].includes((event as KeyboardEvent).key)
      )
        return;
      send("interaction", {
        type,
        label: (target?.getAttribute("aria-label") || target?.textContent || "")
          .trim()
          .slice(0, 160),
        key: type === "keydown" ? (event as KeyboardEvent).key : undefined,
        elapsedMs: recordingStarted ? Date.now() - recordingStarted : 0,
      });
    },
    true,
  );
window.addEventListener("error", (event) =>
  send("runtime-error", { message: event.message.slice(0, 1000) }),
);
send("ready", {});
