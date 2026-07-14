"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Braces, Check, MoveDownLeft, MoveUpRight, Plus, Settings2, X } from "lucide-react";
import { useStore, useViewport } from "reactflow";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { getTypeColor, type WorkflowDataType } from "@/lib/workflows/type-mapping";
import type { WorkflowNodeType } from "@/types/workflow";
import { getNodeTheme } from "./nodes/node-theme";
import { getBrandIcon } from "@/lib/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getEdgeColor, getTypeCompatibility } from "@/lib/workflows/type-colors";
import { wouldCreateCycle } from "@/lib/workflows/workflow-validator";
import type { WorkflowPortDefinition } from "@/types/workflow";

interface PortConnection {
  /** Label of the node on the other end of the edge */
  peerLabel: string;
  /** Handle name on the other end, when the edge recorded one */
  peerHandle?: string;
}

interface PortRow {
  name: string;
  type: WorkflowDataType;
  required?: boolean;
  description?: string;
  connections: PortConnection[];
}

const NODE_TYPE_BLURBS: Partial<Record<WorkflowNodeType, string>> = {
  input: "Entry point — receives the values the workflow is started with and hands them to the first steps.",
  output: "Exit point — whatever arrives here becomes the workflow's final result.",
  condition: "Evaluates its expression against the incoming value and routes execution down the true or false branch.",
  transform: "Reshapes data between steps by mapping fields from the incoming value to a new structure.",
  loop: "Runs the downstream steps once per item in the incoming array and collects the results.",
  human_approval: "Pauses the workflow until a person approves or rejects, then continues on the matching branch.",
  agent_processor: "Sends the incoming data to an agent with a prompt and returns the agent's structured response.",
  workflow: "Runs another workflow as a single step and returns its result.",
};

/** Config keys already surfaced elsewhere in the panel */
const HIDDEN_CONFIG_KEYS = new Set([
  "toolId", "toolName", "agentId", "agentAvatar", "inputPorts", "outputPorts",
  "prompt", "architecture", "role", "reportsTo", "peerNodeIds", "handoffPolicy",
  "contextPolicy", "sessionPolicy", "checkIn",
]);

/** StepNode geometry — the node column is 148px wide with a centered 64px tile */
const TILE_LEFT = (148 - 64) / 2;
const TILE_WIDTH = 64;

const PANEL_WIDTH = 390;
const PANEL_GAP = 14;
const PANE_MARGIN = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatConfigValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function PortList({
  title,
  ports,
  direction,
  emptyText,
}: {
  title: string;
  ports: PortRow[];
  direction: "in" | "out";
  emptyText: string;
}) {
  const connectedCount = ports.filter((port) => port.connections.length > 0).length;

  return (
    <section>
      <div className="flex items-baseline justify-between px-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {ports.length > 0 && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              connectedCount === ports.length
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground/70"
            )}
          >
            {connectedCount}/{ports.length} connected
          </span>
        )}
      </div>

      {ports.length === 0 ? (
        <p className="px-1 py-1.5 text-[11px] text-muted-foreground/70">{emptyText}</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {ports.map((port) => {
            const unconnectedRequired = port.required && port.connections.length === 0;
            return (
              <div key={port.name} className="rounded-lg px-1.5 py-1.5 hover:bg-muted/40">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-2 ring-background"
                    style={{ backgroundColor: getTypeColor(port.type) }}
                  />
                  <code className="truncate text-[11px] font-medium text-foreground">
                    {port.name}
                  </code>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                    {port.type}
                  </span>
                  {port.required && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
                        unconnectedRequired
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-300/15 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      required
                    </span>
                  )}
                </div>

                {port.description && (
                  <p className="mt-0.5 break-words pl-3.5 text-[10.5px] leading-snug text-muted-foreground">
                    {port.description}
                  </p>
                )}

                <div className="mt-0.5 min-w-0 pl-3.5">
                  {port.connections.length > 0 ? (
                    port.connections.map((connection, index) => (
                      <p
                        key={index}
                        className="flex min-w-0 items-center gap-1 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        {direction === "in" ? (
                          <MoveDownLeft className="h-3 w-3 shrink-0" />
                        ) : (
                          <MoveUpRight className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">
                          {direction === "in" ? "from" : "to"} {connection.peerLabel}
                          {connection.peerHandle && (
                            <span className="text-emerald-600/60 dark:text-emerald-400/60">
                              {" · "}
                              {connection.peerHandle}
                            </span>
                          )}
                        </span>
                      </p>
                    ))
                  ) : (
                    <p
                      className={cn(
                        "text-[10.5px]",
                        unconnectedRequired
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {unconnectedRequired ? "Not connected — needs a value" : "Not connected"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const PORT_TYPES: WorkflowDataType[] = ["any", "string", "number", "boolean", "object", "array"];

function AddPort({ onAdd }: { onAdd: (port: WorkflowPortDefinition) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WorkflowDataType>("string");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 px-1.5 text-[10.5px] text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add field
      </Button>
    );
  }

  const save = () => {
    const path = name.trim().replace(/^\.+|\.+$/g, "");
    if (!path) return;
    onAdd({ name: path, path, type, custom: true });
    setName("");
    setType("string");
    setOpen(false);
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2">
      <div className="flex gap-1.5">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="payload.subject" className="h-7 flex-1 font-mono text-[10.5px]" autoFocus onKeyDown={(event) => event.key === "Enter" && save()} />
        <Select value={type} onValueChange={(value) => setType(value as WorkflowDataType)}>
          <SelectTrigger className="h-7 w-[92px] text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>{PORT_TYPES.map((value) => <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="icon" className="h-7 w-7" onClick={save} aria-label="Add field"><Check className="h-3 w-3" /></Button>
      </div>
      <p className="mt-1 text-[9.5px] text-muted-foreground">Use dots to build nested objects.</p>
    </div>
  );
}

/**
 * Floating inspector for a canvas node, opened explicitly from the node's
 * hover card. Anchors beside the node, follows it through drag/pan/zoom,
 * and stays inside the visible canvas. Must render inside the React Flow
 * provider — it reads the live viewport transform.
 */
export function NodeDetailsPanel() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const detailsNodeId = useWorkflowStore((state) => state.detailsNodeId);
  const setDetailsNodeId = useWorkflowStore((state) => state.setDetailsNodeId);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const [editing, setEditing] = useState(false);

  const viewport = useViewport();
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);

  // Measure real height so bottom-edge clamping tracks the content
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(280);
  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const measure = () => setPanelHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [detailsNodeId]);

  const node = detailsNodeId
    ? nodes.find((candidate) => candidate.id === detailsNodeId) ?? null
    : null;

  const sourceOptions = useMemo(() => {
    if (!node) return [];
    return nodes
      .filter((candidate) => candidate.id !== node.id)
      .flatMap((candidate) =>
        (candidate.data.outputs ?? []).map((port) => ({
          value: `${candidate.id}\u001f${port.path ?? port.name}`,
          nodeId: candidate.id,
          nodeLabel: candidate.data.label,
          path: port.path ?? port.name,
          type: port.type,
        }))
      );
  }, [node, nodes]);

  const updateNodeData = (updates: Record<string, any>) => {
    if (!node) return;
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  const updateConfig = (key: string, value: any) => {
    if (!node) return;
    updateNodeData({ config: { ...(node.data.config ?? {}), [key]: value } });
  };

  const setWorkflowArchitecture = (architecture: string) => {
    const agentNodes = nodes.filter((candidate) => candidate.type === "agent_processor");
    for (const agentNode of agentNodes) {
      updateNode(agentNode.id, {
        data: {
          ...agentNode.data,
          config: {
            ...(agentNode.data.config ?? {}),
            architecture,
            ...(architecture === "peer_to_peer"
              ? { peerNodeIds: agentNodes.filter((peer) => peer.id !== agentNode.id).map((peer) => peer.id), reportsTo: undefined }
              : {}),
          },
        },
      });
    }
  };

  const addPort = (direction: "inputs" | "outputs", port: WorkflowPortDefinition) => {
    if (!node) return;
    const current = node.data[direction] ?? [];
    if (current.some((candidate) => candidate.name === port.name)) return;
    updateNodeData({ [direction]: [...current, port] });
  };

  const mapInput = (target: WorkflowPortDefinition, selection: string) => {
    if (!node) return;
    const remaining = edges.filter(
      (edge) => !(edge.target === node.id && edge.targetHandle === target.name)
    );
    if (selection === "__none__") {
      setEdges(remaining);
      return;
    }

    const [sourceId, sourcePath] = selection.split("\u001f");
    const source = nodes.find((candidate) => candidate.id === sourceId);
    const sourcePort = source?.data.outputs?.find(
      (port) => (port.path ?? port.name) === sourcePath
    );
    if (!source || !sourcePort) return;
    if (wouldCreateCycle(nodes, remaining, { source: sourceId, target: node.id })) return;

    const compatibility = getTypeCompatibility(sourcePort.type, target.type);
    if (!compatibility.compatible || compatibility.mode === "incompatible") return;

    setEdges([
      ...remaining,
      {
        id: `${sourceId}-${node.id}-${target.name}-${Date.now()}`,
        source: sourceId,
        target: node.id,
        sourceHandle: sourcePort.name,
        targetHandle: target.name,
        type: "colored",
        data: {
          dataType: sourcePort.type,
          color: getEdgeColor(sourcePort.type, target.type),
          mapping: { [sourcePath]: target.path ?? target.name },
          targetTypes: { [target.path ?? target.name]: target.type },
          mappingMode: compatibility.mode,
        },
      },
    ]);
  };

  const details = useMemo(() => {
    if (!node) return null;

    const nodeType = (node.data.nodeType || node.type || "tool") as WorkflowNodeType;
    const schemaParams = node.data.schema?.function?.parameters?.properties ?? {};
    const nodeLabel = (id: string) =>
      nodes.find((candidate) => candidate.id === id)?.data.label ?? "Unknown step";

    // Same fallbacks StepNode uses, so panel and handles always agree
    const inputPorts =
      node.data.inputs ??
      (nodeType === "output" ? [{ name: "input", type: "any" as WorkflowDataType }] : []);
    const outputPorts =
      node.data.outputs ??
      (nodeType === "input" ? [{ name: "output", type: "any" as WorkflowDataType }] : []);

    const inputs: PortRow[] = inputPorts.map((input) => ({
      name: input.name,
      type: input.type,
      required: (input as { required?: boolean }).required,
      description:
        (input as { description?: string }).description ?? schemaParams[input.name]?.description,
      connections: edges
        .filter(
          (edge) =>
            edge.target === node.id &&
            // Legacy edges may not record a handle; with a single input the wiring is unambiguous
            (edge.targetHandle ? edge.targetHandle === input.name : inputPorts.length === 1)
        )
        .map((edge) => ({ peerLabel: nodeLabel(edge.source), peerHandle: edge.sourceHandle })),
    }));

    const outputs: PortRow[] = outputPorts.map((output) => ({
      name: output.name,
      type: output.type,
      description: (output as { description?: string }).description,
      connections: edges
        .filter(
          (edge) =>
            edge.source === node.id &&
            (edge.sourceHandle ? edge.sourceHandle === output.name : outputPorts.length === 1)
        )
        .map((edge) => ({ peerLabel: nodeLabel(edge.target), peerHandle: edge.targetHandle })),
    }));

    const description =
      node.data.description ||
      node.data.schema?.function?.description ||
      NODE_TYPE_BLURBS[nodeType];

    const configEntries = Object.entries(node.data.config ?? {}).filter(
      ([key, value]) => !HIDDEN_CONFIG_KEYS.has(key) && value != null && value !== ""
    );

    return { nodeType, inputs, outputs, description, configEntries };
  }, [node, nodes, edges]);

  if (!node || !details) return null;

  const theme = getNodeTheme(details.nodeType);
  const Icon = theme.icon;
  const brand =
    details.nodeType === "tool" ? getBrandIcon(node.data.toolName, node.data.label) : null;

  // Anchor beside the node's icon tile: right of it when there's room,
  // otherwise flip left; always clamped to the visible pane.
  const { x: translateX, y: translateY, zoom } = viewport;
  const tileLeft = (node.position.x + TILE_LEFT) * zoom + translateX;
  const tileRight = (node.position.x + TILE_LEFT + TILE_WIDTH) * zoom + translateX;
  const nodeTop = node.position.y * zoom + translateY;

  let left = tileRight + PANEL_GAP;
  if (left + PANEL_WIDTH > paneWidth - PANE_MARGIN) {
    left = tileLeft - PANEL_GAP - PANEL_WIDTH;
  }
  left = clamp(left, PANE_MARGIN, Math.max(PANE_MARGIN, paneWidth - PANEL_WIDTH - PANE_MARGIN));

  const maxHeight = Math.min(560, paneHeight - PANE_MARGIN * 2);
  const top = clamp(
    nodeTop,
    PANE_MARGIN,
    Math.max(PANE_MARGIN, paneHeight - Math.min(panelHeight, maxHeight) - PANE_MARGIN)
  );

  return (
    <div
      ref={panelRef}
      className="floating-panel absolute z-20 flex flex-col overflow-hidden"
      style={{ left, top, width: PANEL_WIDTH, maxHeight }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/70 px-3 py-2.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            brand ? "border border-border bg-background" : theme.tile
          )}
        >
          {brand ? (
            <brand.icon
              size={18}
              color={brand.monochrome ? "currentColor" : brand.hex}
              className={brand.monochrome ? "text-foreground" : undefined}
            />
          ) : (
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{node.data.label}</p>
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                theme.chip
              )}
            >
              {theme.label}
            </span>
            {node.data.toolName && (
              <code className="truncate text-[10px] text-muted-foreground/70">
                {node.data.toolName}
              </code>
            )}
          </div>
        </div>
        <Button
          variant={editing ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={() => setEditing((value) => !value)}
          aria-label={editing ? "Finish editing node" : "Edit node"}
          title={editing ? "Finish editing" : "Edit fields and settings"}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={() => setDetailsNodeId(null)}
          aria-label="Close node details"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2.5 py-2.5">
        {editing && (
          <section className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Step name</Label>
              <Input value={node.data.label} onChange={(event) => updateNodeData({ label: event.target.value })} className="h-8 text-xs" />
            </div>
            {details.nodeType === "agent_processor" && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Instruction</Label>
                <Textarea
                  value={node.data.config?.prompt ?? ""}
                  onChange={(event) => updateConfig("prompt", event.target.value)}
                  placeholder="Describe this agent's responsibility and expected output…"
                  className="min-h-[72px] resize-y text-xs"
                />
              </div>
            )}
          </section>
        )}
        {details.description && (
          <p className="break-words px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {details.description}
          </p>
        )}

        <PortList
          title="Inputs"
          ports={details.inputs}
          direction="in"
          emptyText="This step takes no inputs."
        />
        {editing && details.nodeType !== "input" && (
          <section className="space-y-1.5 rounded-xl border border-border/70 p-2">
            <div className="flex items-center gap-1.5 px-0.5">
              <Braces className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Map inputs</h4>
            </div>
            {(node.data.inputs ?? []).map((target) => {
              const connected = edges.find(
                (edge) => edge.target === node.id && edge.targetHandle === target.name
              );
              const currentValue = connected
                ? `${connected.source}\u001f${Object.keys(connected.data?.mapping ?? {})[0] ?? connected.sourceHandle ?? ""}`
                : "__none__";
              const compatibleOptions = sourceOptions.filter(
                (source) => getTypeCompatibility(source.type, target.type).compatible
              );
              return (
                <div key={target.name} className="grid grid-cols-[112px_1fr] items-center gap-2">
                  <div className="min-w-0">
                    <code className="block truncate text-[10.5px] font-medium">{target.name}</code>
                    <span className="text-[9px] text-muted-foreground">{target.type}</span>
                  </div>
                  <Select value={currentValue} onValueChange={(value) => mapInput(target, value)}>
                    <SelectTrigger className="h-8 min-w-0 text-[10.5px]"><SelectValue placeholder="Choose output…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">Not mapped</SelectItem>
                      {compatibleOptions.map((source) => (
                        <SelectItem key={source.value} value={source.value} className="text-xs">
                          {source.nodeLabel} · {source.path} ({source.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            <AddPort onAdd={(port) => addPort("inputs", port)} />
          </section>
        )}
        <PortList
          title="Outputs"
          ports={details.outputs}
          direction="out"
          emptyText="This step produces no outputs."
        />
        {editing && details.nodeType !== "output" && (
          <div className="rounded-xl border border-dashed border-border/70 p-2">
            <p className="mb-1 px-1 text-[9.5px] text-muted-foreground">Expose a nested result field as its own connector.</p>
            <AddPort onAdd={(port) => addPort("outputs", port)} />
          </div>
        )}

        {editing && details.nodeType === "agent_processor" && (
          <section className="space-y-2 rounded-xl border border-blue-200/70 bg-blue-50/30 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Coordination</h4>
              <p className="text-[9.5px] text-muted-foreground">Defines role, reporting, handoffs, and shared context for this agent.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[9.5px]">Architecture</Label>
                <Select value={node.data.config?.architecture ?? "sequential"} onValueChange={setWorkflowArchitecture}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential</SelectItem>
                    <SelectItem value="hierarchical">Hierarchical</SelectItem>
                    <SelectItem value="peer_to_peer">Peer to peer</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9.5px]">Role</Label>
                <Select value={node.data.config?.role ?? "specialist"} onValueChange={(value) => updateConfig("role", value)}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orchestrator">Orchestrator</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="specialist">Specialist</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="peer">Peer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[9.5px]">Reports to</Label>
              <Select value={node.data.config?.reportsTo ?? "__none__"} onValueChange={(value) => updateConfig("reportsTo", value === "__none__" ? undefined : value)}>
                <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No supervisor</SelectItem>
                  {nodes.filter((candidate) => candidate.id !== node.id && candidate.type === "agent_processor").map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>{candidate.data.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[9.5px]">Context</Label>
                <Select value={node.data.config?.contextPolicy ?? "shared"} onValueChange={(value) => updateConfig("contextPolicy", value)}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="shared">Shared</SelectItem><SelectItem value="summary">Summary only</SelectItem><SelectItem value="isolated">Isolated</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9.5px]">Handoff</Label>
                <Select value={node.data.config?.handoffPolicy ?? "on_success"} onValueChange={(value) => updateConfig("handoffPolicy", value)}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="on_success">On success</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[9.5px]">Session</Label>
                <Select value={node.data.config?.sessionPolicy ?? "workflow"} onValueChange={(value) => updateConfig("sessionPolicy", value)}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="workflow">Shared run</SelectItem><SelectItem value="agent">Per agent</SelectItem><SelectItem value="new_each_run">Fresh each run</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9.5px]">Check in</Label>
                <Select value={node.data.config?.checkIn ?? "after_step"} onValueChange={(value) => updateConfig("checkIn", value)}>
                  <SelectTrigger className="h-8 text-[10.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="never">Never</SelectItem><SelectItem value="before_handoff">Before handoff</SelectItem><SelectItem value="after_step">After each step</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </section>
        )}

        {details.configEntries.length > 0 && (
          <section>
            <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configuration
            </h4>
            <div className="mt-1 space-y-0.5">
              {details.configEntries.map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2 rounded-lg px-1.5 py-1">
                  <code className="shrink-0 text-[11px] font-medium text-foreground">{key}</code>
                  <span className="min-w-0 break-words text-[11px] text-muted-foreground">
                    {formatConfigValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
