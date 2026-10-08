import { trustedDisplayCapture } from "./display-capture-policy";
import { desktopCapturer, Menu, type BrowserWindow, type Session, type WebContents } from "electron";

/** Only a user gesture in the Commons document can open the source chooser. */
export function installDisplayCapture(session: Session, current: () => {
  contents: WebContents | null;
  window: BrowserWindow | null;
  origin: string;
  generation: number;
  mode: string;
  changing: boolean;
}) {
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const snapshot = current();
    const trusted = () => trustedDisplayCapture(request, snapshot, current());
    if (!trusted() || !snapshot.window || snapshot.window.isDestroyed()) { callback({}); return; }
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
      if (!trusted() || !sources.length) { callback({}); return; }
      const source = await new Promise<(typeof sources)[number] | null>((resolve) => {
        const menu = Menu.buildFromTemplate([
          { label: "Choose what to record", enabled: false },
          { type: "separator" },
          ...sources.map((source) => ({ label: source.name.slice(0, 160), click: () => resolve(source) })),
          { type: "separator" },
          { label: "Cancel", click: () => resolve(null) },
        ]);
        menu.popup({ window: snapshot.window!, callback: () => resolve(null) });
      });
      if (!trusted() || !source) { callback({}); return; }
      callback({ video: source, ...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" as const } : {}) });
    } catch {
      // OS denial, a cancelled PipeWire picker, or a replaced document.
      if (request.frame && !request.frame.isDestroyed()) callback({});
    }
  });
}
