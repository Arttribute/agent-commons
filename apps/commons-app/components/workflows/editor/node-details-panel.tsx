"use client";

import { useMemo } from "react";
import { MoveDownLeft, MoveUpRight, X } from "lucide-react";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { getTypeColor, type WorkflowDataType } from "@/lib/workflows/type-mapping";
import type { ReactFlowNode, WorkflowNodeType } from "@/types/workflow";
import { getNodeTheme } from "./nodes/node-theme";
import { getBrandIcon } from "@/lib/brand-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
const HIDDEN_CONFIG_KEYS = new Set(["toolId", "toolName"]);

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
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-2 ring-background"
                    style={{ backgroundColor: getTypeColor(port.type) }}
                  />
                  <code className="text-[11px] font-medium text-foreground">{port.name}</code>
                  <span className="text-[10px] text-muted-foreground/70">{port.type}</span>
                  {port.required && (
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
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
                  <p className="mt-0.5 pl-3.5 text-[10.5px] leading-snug text-muted-foreground">
                    {port.description}
                  </p>
                )}

                <div className="mt-0.5 pl-3.5">
                  {port.connections.length > 0 ? (
                    port.connections.map((connection, index) => (
                      <p
                        key={index}
                        className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400"
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

/**
 * Floating inspector for the selected canvas node: what the step does,
 * which parameters flow in and out, and what they're wired to right now.
 */
export function NodeDetailsPanel() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const setNodes = useWorkflowStore((state) => state.setNodes);

  const selectedNodes = useMemo(
    () => nodes.filter((node) => (node as ReactFlowNode & { selected?: boolean }).selected),
    [nodes]
  );
  const node = selectedNodes.length === 1 ? selectedNodes[0] : null;

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

  const deselect = () =>
    setNodes(nodes.map((candidate) => ({ ...candidate, selected: false })));

  return (
    <div className="floating-panel absolute bottom-3 left-1/2 z-20 flex max-h-[46%] w-[400px] -translate-x-1/2 flex-col overflow-hidden">
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
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
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
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={deselect}
          aria-label="Close node details"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2.5 py-2.5">
        {details.description && (
          <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {details.description}
          </p>
        )}

        <PortList
          title="Inputs"
          ports={details.inputs}
          direction="in"
          emptyText="This step takes no inputs."
        />
        <PortList
          title="Outputs"
          ports={details.outputs}
          direction="out"
          emptyText="This step produces no outputs."
        />

        {details.configEntries.length > 0 && (
          <section>
            <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configuration
            </h4>
            <div className="mt-1 space-y-0.5">
              {details.configEntries.map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2 rounded-lg px-1.5 py-1">
                  <code className="shrink-0 text-[11px] font-medium text-foreground">{key}</code>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">
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
