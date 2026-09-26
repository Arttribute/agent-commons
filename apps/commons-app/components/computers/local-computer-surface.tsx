"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalState } from "@agent-commons/desktop-contract";
import { FolderOpen, SquareTerminal, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComputerRuntimeTab } from "./computer-types";

export function LocalComputerSurface({ agentId, conversationId, activeTab, embedded, onClose, className }: {
  agentId: string;
  conversationId?: string;
  activeTab?: ComputerRuntimeTab;
  embedded?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<LocalState>();
  const [error, setError] = useState<string>();
  const opened = useRef("");
  const open = useCallback(async (target: "files" | "terminal") => {
    setError(undefined);
    try {
      const bridge = window.agentCommonsLocal;
      if (!bridge?.openComputer) throw new Error("Update Agent Commons Desktop to open computer windows.");
      await bridge.openComputer({ agentId, conversationId, target });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open computer window."); }
  }, [agentId, conversationId]);

  useEffect(() => {
    const bridge = window.agentCommonsLocal;
    if (!bridge) return;
    void bridge.getState().then(setState).catch((cause) => setError(String(cause)));
    return bridge.onEvent((event) => { if (event.type === "state") setState(event.state); });
  }, []);

  useEffect(() => {
    if (embedded || activeTab === "browser") return;
    const key = `${agentId}:${conversationId}:${activeTab}`;
    if (opened.current === key) return;
    opened.current = key;
    void open(activeTab === "terminal" ? "terminal" : "files");
  }, [agentId, conversationId, activeTab, embedded, open]);

  const conversation = state?.conversations.find((item) => item.id === conversationId);
  const tools = conversation?.messages.filter((item) => item.role === "tool").slice(-6) ?? [];
  return <aside className={cn("flex min-h-0 flex-col border-l bg-background", embedded ? "w-full" : "w-[min(520px,50vw)] shrink-0", className)}>
    <div className="flex items-center justify-between border-b p-4">
      <div><h2 className="font-medium">This computer</h2><p className="text-xs text-muted-foreground">Private Local workspace</p></div>
      {onClose && <Button variant="ghost" size="icon" aria-label="Close computer" onClick={onClose}><X className="h-4 w-4" /></Button>}
    </div>
    <div className="space-y-5 overflow-y-auto p-4">
      <p className="break-all text-sm text-muted-foreground">{conversation?.workspaceRoot || "Your home folder"}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void open("files")}><FolderOpen className="mr-2 h-4 w-4" />Open folder</Button>
        <Button variant="outline" onClick={() => void open("terminal")}><SquareTerminal className="mr-2 h-4 w-4" />Open terminal</Button>
      </div>
      <p className="text-xs text-muted-foreground">Files and terminal open in your computer’s own windows. Agent command results appear below.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!!state?.apps.length && <div className="space-y-2"><h3 className="text-sm font-medium">Local apps</h3>{state.apps.map((app) => <Button key={app.id} variant="outline" className="mr-2" onClick={() => {
        void window.agentCommonsLocal?.openApp(app.id).catch((cause) => setError(String(cause)));
      }}><ExternalLink className="mr-2 h-4 w-4" />{app.name}</Button>)}</div>}
      {activeTab === "browser" && !state?.apps.length && <p className="text-sm text-muted-foreground">Registered local app previews will appear here.</p>}
      {tools.map((tool) => <details key={tool.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{tool.toolName?.replace(/^(cli_|local_)/, "").replaceAll("_", " ")}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{tool.content}</pre></details>)}
    </div>
  </aside>;
}
