import { contextBridge, ipcRenderer } from "electron";
import type { CloudDesktopBridge } from "@agent-commons/desktop-contract";

const bridge: CloudDesktopBridge = {
  getInfo: () => ipcRenderer.invoke("desktop:get-info", "cloud"),
  openPrivateWorkspace: () => ipcRenderer.invoke("desktop:open-private"),
};

contextBridge.exposeInMainWorld("agentCommonsDesktop", bridge);
