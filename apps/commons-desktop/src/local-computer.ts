import { homedir } from "node:os";
import { statSync } from "node:fs";
import type { LocalState } from "@agent-commons/desktop-contract";

export function computerWorkspace(state: LocalState, agentId: string, conversationId?: string) {
  if (!state.agents.some((agent) => agent.id === agentId)) throw new Error("Local agent not found");
  const conversation = conversationId ? state.conversations.find((item) => item.id === conversationId) : undefined;
  if (conversationId && (!conversation || conversation.agentId !== agentId)) throw new Error("Local conversation not found for this agent");
  const path = conversation?.workspaceRoot || homedir();
  if (!statSync(path).isDirectory()) throw new Error("The workspace folder is no longer available");
  return path;
}

export function terminalCommand(platform: string, path: string) {
  if (platform === "darwin") return { command: "/usr/bin/open", args: ["-a", "Terminal", path] };
  if (platform === "win32") {
    const script = `Set-Location -LiteralPath '${path.replaceAll("'", "''")}'`;
    return { command: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NoExit", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")] };
  }
  return { command: "x-terminal-emulator", args: ["--working-directory", path] };
}
