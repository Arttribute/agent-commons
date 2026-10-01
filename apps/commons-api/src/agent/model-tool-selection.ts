import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// OpenAI rejects requests with more than 128 function tools. Keep the same
// bound for all providers so a session can change models without breaking.
export const MAX_MODEL_TOOLS = 128;

type NamedTool = ChatCompletionTool & { category?: string };

function words(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? [],
  );
}

function relevance(tool: NamedTool, request: Set<string>): number {
  if (!request.size) return 0;
  const name = words(tool.function.name);
  const description = words(tool.function.description ?? '');
  let score = 0;
  for (const word of request) {
    if (name.has(word)) score += 10;
    else if (description.has(word)) score += 1;
  }
  return score;
}

/** Keep caller-provided and local tools ahead of the broad platform catalog. */
export function selectModelTools<T extends NamedTool>(
  available: T[],
  local: ChatCompletionTool[],
  requestText: string,
  limit = MAX_MODEL_TOOLS,
): { tools: T[]; localTools: ChatCompletionTool[]; omitted: number } {
  if (local.length > limit) {
    throw new Error(`The local tool catalog has ${local.length} tools; this model accepts at most ${limit}.`);
  }
  const seen = new Set<string>();
  const localTools = local.filter((tool) => {
    const name = tool.function.name;
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  const availableNames = new Set(seen);
  const uniqueAvailable = available.filter((tool) => {
    const name = tool.function.name;
    if (!name || availableNames.has(name)) return false;
    availableNames.add(name);
    return true;
  });
  if (uniqueAvailable.length + localTools.length <= limit) {
    return {
      tools: uniqueAvailable,
      localTools,
      omitted: available.length + local.length - uniqueAvailable.length - localTools.length,
    };
  }
  const request = words(requestText);
  const candidates = uniqueAvailable
    .map((tool, index) => ({ tool, index, score: relevance(tool, request) }))
    .sort((a, b) =>
      // Account, agent, space, and MCP tools are configured for this agent;
      // the platform catalog is shared by every agent and can be trimmed.
      Number(b.tool.category !== 'platform') - Number(a.tool.category !== 'platform') ||
      b.score - a.score ||
      a.index - b.index,
    );
  const selected: T[] = [];
  for (const { tool } of candidates) {
    if (selected.length + localTools.length >= limit) break;
    if (seen.has(tool.function.name)) continue;
    seen.add(tool.function.name);
    selected.push(tool);
  }
  return {
    tools: selected,
    localTools,
    omitted: available.length + local.length - selected.length - localTools.length,
  };
}
