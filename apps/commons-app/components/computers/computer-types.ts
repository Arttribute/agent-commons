/**
 * Shared types and pure helpers for the agent computer surface. Kept free of
 * React so both the inline <MiniComputer /> and the full <AgentComputerSurface />
 * can depend on a single source of truth for the computer shape.
 */

export type ComputerResourceProfile = "starter" | "standard" | "performance" | "gpu";

export type ComputerResourceMode = "elastic" | "fixed";

export type AgentComputerStatus =
  | "provisioning"
  | "starting"
  | "running"
  | "idle"
  | "restarting"
  | "resizing"
  | "sleeping"
  | "stopping"
  | "stopped"
  | "terminated"
  | "failed"
  | "error"
  | "unavailable";

export type AgentComputerConfig = {
  configId?: string;
  agentId?: string;
  enabled: boolean;
  allowAgentStart: boolean;
  allowUserSelect: boolean;
  allowBrowser: boolean;
  allowTerminal: boolean;
  allowFilesystem: boolean;
  networkAccess: "standard" | "restricted" | "disabled" | string;
  resourceProfile: ComputerResourceProfile;
  resourceMode: ComputerResourceMode;
  cpuRequest?: string | null;
  cpuLimit?: string | null;
  memoryRequest?: string | null;
  memoryLimit?: string | null;
  storageLimit?: string | null;
  gpuType?: string | null;
  gpuCount?: number | null;
  idleTtlMinutes: number;
  region?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AgentComputer = {
  computerId: string;
  agentId: string;
  sessionId?: string | null;
  ownerUserId?: string | null;
  workspaceId?: string | null;
  name: string;
  status: AgentComputerStatus | string;
  provider: string;
  cloudProvider?: string | null;
  region?: string | null;
  namespaceId?: string | null;
  podName?: string | null;
  resourceProfile?: ComputerResourceProfile | null;
  resourceMode?: ComputerResourceMode | null;
  cpuRequest?: string | null;
  cpuLimit?: string | null;
  memoryRequest?: string | null;
  memoryLimit?: string | null;
  storageLimit?: string | null;
  gpuType?: string | null;
  gpuCount?: number | null;
  workspaceRoot?: string | null;
  workspaceSnapshot?: string | null;
  browser?: {
    status?: "off" | "starting" | "on" | "error";
    url?: string | null;
    title?: string | null;
    screenshot?: string | null;
    lastAction?: string | null;
    error?: string | null;
    updatedAt?: string | null;
  } | null;
  terminal?: {
    lastCommand?: string | null;
    lastOutput?: string | null;
    updatedAt?: string | null;
  } | null;
  lastActivityAt?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Runtime surface an inline scene maps to when the full panel is opened. */
export type ComputerRuntimeTab = "files" | "browser" | "terminal";

export type FsNode = {
  name: string;
  isDir: boolean;
  children: FsNode[];
  depth: number;
};

export function isActiveComputer(computer?: AgentComputer | null) {
  return Boolean(
    computer &&
      ["provisioning", "starting", "running", "idle", "restarting", "resizing"].includes(
        computer.status,
      ),
  );
}

export function isComputerUsable(computer?: AgentComputer | null): computer is AgentComputer {
  return Boolean(computer && ["running", "idle"].includes(computer.status));
}

/** Parse the agent's indented workspace snapshot listing into a nested tree. */
export function parseSnapshot(snapshot: string): FsNode[] {
  const lines = snapshot.split("\n").filter(Boolean);
  const root: FsNode[] = [];
  const stack: Array<{ node: FsNode; indent: number }> = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const indent = line.length - line.trimStart().length;
    const name = line.trim().replace("... (truncated)", "...");
    if (!name) continue;
    const isDir = name.endsWith("/");
    const node: FsNode = {
      name: isDir ? name.slice(0, -1) : name,
      isDir,
      children: [],
      depth: indent,
    };
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1]!.node.children.push(node);
    stack.push({ node, indent });
  }
  return root;
}

/** Resolve the child nodes at a given path, folders first then files, sorted. */
export function currentNodes(tree: FsNode[], path: string[]) {
  let nodes = tree;
  for (const segment of path) {
    const next = nodes.find((node) => node.isDir && node.name === segment);
    if (!next) return [];
    nodes = next.children;
  }
  return [
    ...nodes.filter((node) => node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
    ...nodes.filter((node) => !node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}
