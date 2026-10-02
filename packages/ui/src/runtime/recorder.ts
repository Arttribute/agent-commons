import { record } from "@rrweb/record";

const channel = (window as any).__commonsCanvasChannel as string;
let stop: (() => void) | undefined;
let recordingStarted = 0;
let bytes = 0;
let sequence = 0;
const send = (type: string, payload: unknown) =>
  parent.postMessage({ channel, type, payload }, "*");
// Freeze the rendered game while the user draws, so a moving target cannot
// change underneath a point/region selection. Host recording timers stay native.
const nativeFrame = window.requestAnimationFrame.bind(window);
const nativeCancelFrame = window.cancelAnimationFrame.bind(window);
const nativeTimeout = window.setTimeout.bind(window);
const nativeInterval = window.setInterval.bind(window);
let editing = false;
const pausedFrames = new Map<number, FrameRequestCallback>();
let pausedAnimations: Animation[] = [];
window.requestAnimationFrame = (callback) => {
  let id = 0;
  id = nativeFrame((time) => {
    if (editing) pausedFrames.set(id, callback);
    else callback(time);
  });
  return id;
};
window.cancelAnimationFrame = (id) => {
  pausedFrames.delete(id);
  nativeCancelFrame(id);
};
window.setInterval = ((
  handler: TimerHandler,
  timeout?: number,
  ...args: any[]
) =>
  typeof handler === "function"
    ? nativeInterval(() => {
        if (!editing) handler(...args);
      }, timeout)
    : nativeInterval(handler, timeout, ...args)) as typeof setInterval;
function setEditing(next: boolean) {
  if (next === editing) return;
  editing = next;
  if (editing) {
    pausedAnimations = document
      .getAnimations()
      .filter((a) => a.playState === "running");
    pausedAnimations.forEach((a) => a.pause());
  } else {
    pausedAnimations.forEach((a) => a.play());
    pausedAnimations = [];
    for (const callback of pausedFrames.values()) nativeFrame(callback);
    pausedFrames.clear();
  }
}
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
type Inspected = {
  selector: string;
  tag: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  src?: string;
  alt?: string;
  href?: string;
  icon?: string;
  html?: string;
  rect: { x: number; y: number; width: number; height: number };
};
const MEANINGFUL =
  "a,button,img,svg,video,audio,canvas,input,select,textarea,label,h1,h2,h3,h4,h5,h6,p,li,th,td,figure,[role],[aria-label],[data-testid]";
function cssPath(element: Element) {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && parts.length < 6) {
    if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const classes = [...node.classList]
      .filter((name) => /^[a-zA-Z][\w-]{1,40}$/.test(name) && !/^(css|sc|jsx|svelte)-/.test(name))
      .slice(0, 2);
    if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((child) => child.tagName === node!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}
function trimmedHtml(element: Element) {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("*").forEach((child) => {
    for (const attribute of [...child.attributes]) {
      if (attribute.value.length > 120) child.setAttribute(attribute.name, `${attribute.value.slice(0, 120)}…`);
    }
  });
  const html = clone.outerHTML.replace(/\s+/g, " ");
  return html.length > 1200 ? `${html.slice(0, 1200)}…` : html;
}
function iconName(element: Element) {
  const svg = element.tagName.toLowerCase() === "svg" ? element : element.querySelector("svg");
  if (!svg) return undefined;
  const classes = [...svg.classList].filter((name) => /icon|lucide|fa-|bi-|material/i.test(name));
  const use = svg.querySelector("use")?.getAttribute("href");
  return (
    svg.getAttribute("data-lucide") ||
    svg.getAttribute("aria-label") ||
    classes.join(" ") ||
    use ||
    "svg icon"
  ).slice(0, 120);
}
function describeElement(element: Element): Inspected {
  const box = element.getBoundingClientRect();
  const media = element as HTMLImageElement & HTMLMediaElement & HTMLAnchorElement;
  const text = ((element as HTMLElement).innerText ?? element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    selector: cssPath(element),
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") ?? undefined,
    ariaLabel: element.getAttribute("aria-label") ?? element.getAttribute("title") ?? undefined,
    text: text ? text.slice(0, 300) : undefined,
    src: media.currentSrc || element.getAttribute("src") || undefined,
    alt: element.getAttribute("alt") ?? undefined,
    href: element.getAttribute("href") ?? undefined,
    icon: iconName(element),
    html: trimmedHtml(element),
    rect: {
      x: box.left / innerWidth,
      y: box.top / innerHeight,
      width: box.width / innerWidth,
      height: box.height / innerHeight,
    },
  };
}
function meaningful(element: Element | null) {
  let node = element;
  for (let depth = 0; node && depth < 4; depth += 1) {
    if (node.matches(MEANINGFUL)) return node;
    node = node.parentElement;
  }
  return element;
}
/** Elements under a point, or the top-level elements inside a region. */
function inspect(area: { x: number; y: number; width?: number; height?: number }) {
  if (!area.width || !area.height) {
    const hit = document.elementFromPoint(area.x, area.y);
    const target = meaningful(hit);
    if (!target || target === document.body || target === document.documentElement) return { elements: [] };
    const elements = [describeElement(target)];
    if (hit && hit !== target && hit.tagName.toLowerCase() !== "path") elements.push(describeElement(hit));
    return { elements };
  }
  const left = area.x;
  const top = area.y;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const inside = [...document.body.querySelectorAll(MEANINGFUL)].filter((element) => {
    const box = element.getBoundingClientRect();
    return (
      box.width > 2 &&
      box.height > 2 &&
      box.left >= left - 2 &&
      box.top >= top - 2 &&
      box.right <= right + 2 &&
      box.bottom <= bottom + 2
    );
  });
  const topLevel = inside.filter(
    (element) => !inside.some((other) => other !== element && other.contains(element)),
  );
  if (!topLevel.length) {
    const center = meaningful(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
    return { elements: center && center !== document.body ? [describeElement(center)] : [] };
  }
  return { elements: topLevel.slice(0, 8).map(describeElement) };
}
window.addEventListener("message", async (event) => {
  if (event.source !== parent || event.data?.channel !== channel) return;
  const { requestId, command, payload } = event.data;
  try {
    let result: unknown;
    if (command === "mode") {
      setEditing(payload?.editing === true);
      result = { editing };
    } else if (command === "snapshot") {
      if (stop) throw Error("An interaction recording is already active.");
      const events: unknown[] = [];
      let size = 0;
      const stopSnapshot = record({
        recordCanvas: true,
        inlineImages: true,
        maskAllInputs: true,
        emit(event) {
          size += JSON.stringify(event).length;
          if (size <= 8 * 1024 * 1024) events.push(event);
        },
      });
      await new Promise((resolve) => nativeTimeout(resolve, 80));
      stopSnapshot?.();
      if (size > 8 * 1024 * 1024)
        throw Error("This snapshot exceeds the 8 MB context limit.");
      result = { events, durationMs: 80 };
    } else if (command === "observe") result = observe();
    else if (command === "inspect") result = inspect(payload ?? {});
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
      await new Promise((resolve) => nativeFrame(() => resolve(null)));
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
