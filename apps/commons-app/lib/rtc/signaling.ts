export type Role = "human" | "agent";

export type SignalMsg =
  | { type: "join"; spaceId: string; fromId: string; role: Role }
  | {
      type: "publishState";
      spaceId: string;
      fromId: string;
      role: Role;
      publish: { audio: boolean; video: boolean };
    }
  | {
      type: "offer" | "answer";
      spaceId: string;
      fromId: string;
      role: Role;
      targetId: string;
      sdp: any;
    }
  | {
      type: "candidate";
      spaceId: string;
      fromId: string;
      role: Role;
      targetId: string;
      candidate: any;
    }
  | { type: "leave"; spaceId: string; fromId: string; role: Role }
  | {
      type: "mute" | "unmute";
      spaceId: string;
      fromId: string;
      role: Role;
      mute?: { audio?: boolean; video?: boolean };
    };

export function createSpaceSocket(baseUrl: string) {
  let ws: WebSocket | null = null;
  const listeners = new Set<(msg: any) => void>();
  const queue: SignalMsg[] = [];
  let closedExplicitly = false;
  let retries = 0;
  const maxRetries = 10;

  function connect() {
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    console.log("[RTC] connecting WS to:", baseUrl);
    ws = new WebSocket(baseUrl);

    ws.onopen = () => {
      console.log("[RTC] WS open:", baseUrl);
      retries = 0;
      // flush queue
      while (queue.length) {
        const frame = queue.shift()!;
        console.log("[RTC] >>>", frame.type, frame);
        ws!.send(JSON.stringify(frame));
      }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log("[RTC] <<<", data.type, data);
        listeners.forEach((l) => l(data));
      } catch (err) {
        console.warn("[RTC] onmessage json parse failed:", err);
      }
    };

    ws.onclose = (ev) => {
      console.log("[RTC] WS close:", baseUrl, ev.code, ev.reason);
      if (closedExplicitly) return;
      // reconnect with backoff
      const delay = Math.min(30000, 1000 * Math.pow(2, retries++));
      if (retries <= maxRetries) {
        setTimeout(connect, delay);
      }
    };

    ws.onerror = (ev) => {
      console.error("[RTC] WS error:", baseUrl, ev);
      try {
        ws?.close();
      } catch {}
    };
  }

  connect();

  return {
    get socket() {
      return ws!;
    },
    send: (msg: SignalMsg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("[RTC] >>>", msg.type, msg);
        ws.send(JSON.stringify(msg));
      } else {
        queue.push(msg);
      }
    },
    on: (fn: (msg: any) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close: () => {
      closedExplicitly = true;
      try {
        ws?.close();
      } catch {}
    },
  };
}
