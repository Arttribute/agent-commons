"use client";
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { recorderBundle } from "./recorder-bundle";
import { replayerBundle } from "./replayer-bundle";

export type CompiledPreview =
  | { type: "html"; html: string }
  | { type: "url"; url: string }
  | { type: "unavailable"; error: string };
export type CanvasObservation = {
  state: unknown;
  actions: { id: string; label: string }[];
};
export type CanvasInteraction = {
  type: string;
  label: string;
  key?: string;
  elapsedMs: number;
};
export type CanvasRecording = {
  format: "commons.recording.v1";
  id: string;
  createdAt: string;
  durationMs: number;
  events: unknown[];
  interactions: CanvasInteraction[];
  title: string;
};
export type CanvasMoment = {
  recordingId?: string;
  timeMs: number;
  interaction?: CanvasInteraction;
};
export type CompiledFrameHandle = {
  observe: () => Promise<CanvasObservation>;
  act: (id: string) => Promise<CanvasObservation>;
  snapshot: () => Promise<CanvasRecording>;
  moment: () => CanvasMoment;
  recording: () => CanvasRecording | undefined;
};
function runtimeScript(bundle: string, channel: string) {
  return `<script>window.__commonsCanvasChannel=${JSON.stringify(channel)};${bundle.replace(/<\/script/gi, "<\\/script")}</script>`;
}
function instrument(html: string, channel: string) {
  const script = runtimeScript(recorderBundle, channel);
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (m) => m + script)
    : script + html;
}
export function downloadRecording(recording: CanvasRecording) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(recording)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${recording.id}.commons-recording.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CompiledArtifactFrame = forwardRef<
  CompiledFrameHandle,
  {
    preview: CompiledPreview;
    title: string;
    className?: string;
    revision?: string | number;
    interactive?: boolean;
    onRecording?: (recording: CanvasRecording) => void;
    onInteraction?: (interaction: CanvasInteraction) => void;
  }
>(function CompiledArtifactFrame(
  {
    preview,
    title,
    className = "",
    revision,
    interactive = true,
    onRecording,
    onInteraction,
  },
  ref,
) {
  const channel = useId(),
    frame = useRef<HTMLIFrameElement>(null),
    ready = useRef(false);
  const pending = useRef(
    new Map<
      string,
      {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const host = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setScale(Math.min(el.clientWidth / 1280, el.clientHeight / 720)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview.type]);
  const active = useRef<CanvasRecording | undefined>(undefined),
    lastInteraction = useRef<CanvasInteraction | undefined>(undefined),
    started = useRef(0);
  const [recording, setRecording] = useState(false),
    [saved, setSaved] = useState<CanvasRecording>(),
    [replay, setReplay] = useState(false),
    [error, setError] = useState("");
  const callbacks = useRef({ onRecording, onInteraction });
  callbacks.current = { onRecording, onInteraction };
  const html = useMemo(
    () =>
      preview.type === "html" ? instrument(preview.html, channel) : undefined,
    [preview.type === "html" ? preview.html : undefined, channel],
  );
  function command<T>(command: string, payload?: unknown): Promise<T> {
    if (!ready.current)
      return Promise.reject(
        new Error("The compiled preview is still loading."),
      );
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(
          new Error("The game did not respond. Restart the preview and retry."),
        );
      }, 10000);
      pending.current.set(requestId, { resolve, reject, timer });
      frame.current?.contentWindow?.postMessage(
        { channel, command, payload, requestId },
        "*",
      );
    });
  }
  function finish() {
    const result = active.current;
    if (!result) return;
    result.durationMs = Date.now() - started.current;
    active.current = undefined;
    setRecording(false);
    setSaved(result);
    callbacks.current.onRecording?.(result);
  }
  useEffect(() => {
    ready.current = false;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      const { type, payload } = event.data;
      if (type === "ready") {
        ready.current = true;
        frame.current?.contentWindow?.postMessage(
          {
            channel,
            command: "mode",
            payload: { editing: !interactive },
            requestId: "mode-initial",
          },
          "*",
        );
      } else if (type === "response") {
        const request = pending.current.get(payload?.requestId);
        if (request) {
          clearTimeout(request.timer);
          pending.current.delete(payload.requestId);
          payload.error
            ? request.reject(new Error(String(payload.error)))
            : request.resolve(payload.result);
        }
      } else if (type === "record-event" && active.current) {
        active.current.events.push(payload.event);
      } else if (type === "record-limit") {
        finish();
        setError(String(payload?.reason ?? "Recording limit reached."));
      } else if (type === "interaction") {
        lastInteraction.current = payload;
        if (active.current) active.current.interactions.push(payload);
        callbacks.current.onInteraction?.(payload);
      } else if (type === "runtime-error")
        setError(String(payload?.message ?? "Game error"));
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      for (const request of pending.current.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Preview changed."));
      }
      pending.current.clear();
      if (active.current) finish();
    };
  }, [channel, html, revision, replay]);
  useEffect(() => {
    if (ready.current)
      void command("mode", { editing: !interactive }).catch(() => undefined);
  }, [interactive]);
  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      if (active.current)
        return {
          ...active.current,
          events: [...active.current.events],
          durationMs: Date.now() - started.current,
        };
      const snapshot = await command<{ events: unknown[]; durationMs: number }>(
        "snapshot",
      );
      return {
        format: "commons.recording.v1",
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title,
        ...snapshot,
        interactions: [],
      };
    },
    observe: () => command("observe"),
    act: (id) => command("act", { id }),
    moment: () => ({
      recordingId: active.current?.id ?? saved?.id,
      timeMs: active.current
        ? Date.now() - started.current
        : (saved?.durationMs ?? 0),
      interaction: lastInteraction.current,
    }),
    recording: () => active.current ?? saved,
  }));
  if (preview.type === "unavailable")
    return (
      <div role="status" className="ac-preview-error">
        {preview.error}
      </div>
    );
  if (preview.type === "url" && !/^https?:\/\//i.test(preview.url))
    return (
      <div role="alert" className="ac-preview-error">
        The compiled preview URL is invalid.
      </div>
    );
  return (
    <div
      ref={host}
      className={`ac-compiled-frame ac-recordable-frame ${className}`}
    >
      {preview.type === "html" && (
        <div className="ac-recording-controls">
          <button
            type="button"
            disabled={replay}
            title={
              recording
                ? "Stop interaction recording"
                : "Record this artifact’s interactions and canvas (up to five minutes)"
            }
            onClick={() => {
              setError("");
              if (recording) {
                void command("record-stop")
                  .then(finish)
                  .catch((e) => setError(e.message));
              } else {
                started.current = Date.now();
                active.current = {
                  format: "commons.recording.v1",
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  durationMs: 0,
                  events: [],
                  interactions: [],
                  title,
                };
                void command("record-start")
                  .then(() => setRecording(true))
                  .catch((e) => {
                    active.current = undefined;
                    setError(e.message);
                  });
              }
            }}
          >
            {recording ? "■ Stop recording" : "○ Record interaction"}
          </button>
          {saved && (
            <>
              <button
                type="button"
                onClick={() => setReplay(!replay)}
                disabled={recording}
              >
                {replay ? "Return to game" : "Watch recording"}
              </button>
              <button
                type="button"
                onClick={() => downloadRecording(saved)}
                title="Portable recording; store it on your own server"
              >
                Download
              </button>
            </>
          )}
          {recording && <span role="status">Recording</span>}
        </div>
      )}
      {error && (
        <div role="alert" className="ac-recording-error">
          {error}
          <button
            type="button"
            aria-label="Dismiss preview error"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      {replay && saved ? (
        <RecordingPlayer recording={saved} />
      ) : (
        <iframe
          ref={frame}
          key={revision}
          title={title}
          src={preview.type === "url" ? preview.url : undefined}
          srcDoc={html}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
          style={{
            pointerEvents: interactive ? "auto" : "none",
            position: "absolute",
            width: 1280,
            height: 720,
            maxWidth: "none",
            maxHeight: "none",
            left: "50%",
            top: "50%",
            transform: `translate(-50%,-50%) scale(${scale})`,
            transformOrigin: "center",
          }}
          tabIndex={interactive ? 0 : -1}
        />
      )}
    </div>
  );
});
export function RecordingPlayer({ recording }: { recording: CanvasRecording }) {
  const channel = useId(),
    frame = useRef<HTMLIFrameElement>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const html = useMemo(
    () =>
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; media-src data: blob: https:; connect-src 'none'; worker-src blob:"><style>body{margin:0;overflow:auto}.replayer-wrapper{position:relative}.replayer-mouse{display:none}iframe{border:0;max-width:none}</style></head><body>${runtimeScript(replayerBundle, channel)}</body></html>`,
    [channel],
  );
  function send(command: string, extra: Record<string, unknown> = {}) {
    frame.current?.contentWindow?.postMessage(
      { channel, command, ...extra },
      "*",
    );
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      if (event.data.type === "replay-ready")
        send("load", { events: recording.events });
      else if (event.data.type === "replay-error")
        setError(String(event.data.error));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [recording, channel]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setTime((t) => {
          const next = Math.min(t + 250, recording.durationMs);
          if (next === recording.durationMs) setPlaying(false);
          return next;
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [playing, recording.durationMs]);
  return (
    <div className="ac-recording-player">
      {error && <p role="alert">{error}</p>}
      <iframe
        ref={frame}
        // A data URL has a unique origin. Its nested replay frame can share that
        // isolated origin without ever receiving the host application's origin.
        src={`data:text/html;charset=utf-8,${encodeURIComponent(html)}`}
        sandbox="allow-scripts allow-same-origin"
        title={`${recording.title} recording`}
        referrerPolicy="no-referrer"
      />
      <div className="ac-recording-timeline">
        <button
          type="button"
          onClick={() => {
            send(playing ? "pause" : "play", { timeMs: time });
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          aria-label="Recording timeline"
          type="range"
          min={0}
          max={recording.durationMs}
          step={100}
          value={time}
          onChange={(e) => {
            const next = Number(e.target.value);
            setTime(next);
            setPlaying(false);
            send("seek", { timeMs: next });
          }}
        />
        <span>
          {(time / 1000).toFixed(1)}s /{" "}
          {(recording.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
