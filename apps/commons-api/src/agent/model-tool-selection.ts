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

function explicitlyRequestsGoalCreation(requestText: string): boolean {
  const action = '\\b(?:create|add|set|save|track|start|define|make|record)\\b';
  const object = '\\b(?:goal|objective|milestone)s?\\b';
  return new RegExp(
    `${action}.{0,80}${object}|${object}.{0,80}${action}`,
    'is',
  ).test(requestText);
}

function explicitlyRequestsTaskCreation(requestText: string): boolean {
  const action =
    '\\b(?:create|add|set|save|track|start|define|make|record|schedule|assign)\\b';
  const object = '\\b(?:task|to-?do|reminder|recurring job)s?\\b';
  return new RegExp(
    `${action}.{0,80}${object}|${object}.{0,80}${action}`,
    'is',
  ).test(requestText);
}

function explicitlyRequestsFileArtifact(requestText: string): boolean {
  const artifact =
    '(?:file|document|docx|pdf|presentation|slides?|deck|pptx|spreadsheet|xlsx|csv|markdown|readme|html|artifact|\\.(?:txt|md|pdf|docx|pptx|xlsx|csv|json|html))';
  const direct = new RegExp(
    `\\b(?:create|make|write|draft|generate|produce|build|want|need|send|give)\\b\\s+(?:(?:me|us)\\s+)?(?:(?:a|an|the|new)\\s+)?(?:(?!of\\b|about\\b|from\\b|this\\b|that\\b|in\\b|as\\b|for\\b)[\\w-]+\\s+){0,2}${artifact}\\b`,
    'i',
  );
  const format = new RegExp(
    `\\b(?:save|export|convert|render|deliver)\\b.{0,80}\\b(?:as|to|into)\\s+(?:(?:a|an|the)\\s+)?${artifact}\\b|\\b(?:as|into)\\s+(?:(?:a|an|the)\\s+)?${artifact}\\b`,
    'is',
  );
  return direct.test(requestText) || format.test(requestText);
}

const FILE_ARTIFACT_TOOLS = new Set([
  'createTextFile',
  'createDocumentFile',
  'createPresentationFile',
  'createPdfFile',
  'createSpreadsheetFile',
]);

function isConversationOnlyRequest(requestText: string): boolean {
  const asksForMemory = /\b(?:remember|keep in mind|note that)\b/i.test(
    requestText,
  );
  const asksForTitle =
    /\b(?:chat|conversation)\b.{0,50}\b(?:title|name)\b|\b(?:title|name)\b.{0,50}\b(?:chat|conversation)\b/i.test(
      requestText,
    );
  const explicitlyCreatesResource =
    /\b(?:create|make|write|save|add|upload|publish|send|schedule|set up)\b.{0,100}\b(?:space|knowledge|document|file|task|goal|reminder|email|message|artifact)\b/i.test(
      requestText,
    ) || explicitlyRequestsFileArtifact(requestText);
  return (asksForMemory || asksForTitle) && !explicitlyCreatesResource;
}

function isReadOnlyToolName(name: string): boolean {
  return /^(?:get|list|read|search|find|query|inspect|preview|fetch|lookup|browse|webSearch)(?:[A-Z_]|$)|^cli_(?:read|search|list|browser_snapshot)(?:_|$)/.test(
    name,
  );
}

/** Keep caller-provided and local tools ahead of the broad platform catalog. */
export function selectModelTools<T extends NamedTool>(
  available: T[],
  local: ChatCompletionTool[],
  requestText: string,
  limit = MAX_MODEL_TOOLS,
): { tools: T[]; localTools: ChatCompletionTool[]; omitted: number } {
  if (local.length > limit) {
    throw new Error(
      `The local tool catalog has ${local.length} tools; this model accepts at most ${limit}.`,
    );
  }
  const conversationOnly = isConversationOnlyRequest(requestText);
  const seen = new Set<string>();
  const localTools = local.filter((tool) => {
    const name = tool.function.name;
    if (!name || seen.has(name) || (conversationOnly && !isReadOnlyToolName(name)))
      return false;
    seen.add(name);
    return true;
  });
  const availableNames = new Set(seen);
  const allowGoalCreation = explicitlyRequestsGoalCreation(requestText);
  const allowGoalProgress =
    allowGoalCreation ||
    /\b(?:update|complete|finish|mark|recompute|recalculate)\b.{0,80}\b(?:goal|objective|milestone)s?\b|\b(?:goal|objective|milestone)s?\b.{0,80}\b(?:progress|complete|finish|recompute|recalculate)\b/i.test(
      requestText,
    );
  const allowTaskCreation = explicitlyRequestsTaskCreation(requestText);
  const allowFileArtifact = explicitlyRequestsFileArtifact(requestText);
  const allowTaskProgress =
    allowTaskCreation ||
    /⫷⫷(?:TASK_DISPATCH|AUTOMATED_USER_TRIGGER)⫸⫸|\b(?:update|complete|finish|mark|resume)\b.{0,80}\btask\b/i.test(
      requestText,
    );
  const uniqueAvailable = available.filter((tool) => {
    const name = tool.function.name;
    if (!name || availableNames.has(name)) return false;
    if (conversationOnly && !isReadOnlyToolName(name)) return false;
    // Built-in actions may be registered under different tool categories.
    // Gate their stable function names before ranking the model catalog.
    if (FILE_ARTIFACT_TOOLS.has(name) && !allowFileArtifact) return false;
    // An informational request must not expose a state-changing goal tool.
    // Model instructions alone did not prevent a title request from invoking it.
    if (name === 'createGoal' && !allowGoalCreation) return false;
    if (
      (name === 'updateGoalProgress' || name === 'recomputeGoalProgress') &&
      !allowGoalProgress
    )
      return false;
    if (name === 'createTask' && !allowTaskCreation) return false;
    if (name === 'updateTaskProgress' && !allowTaskProgress)
      return false;
    availableNames.add(name);
    return true;
  });
  if (uniqueAvailable.length + localTools.length <= limit) {
    return {
      tools: uniqueAvailable,
      localTools,
      omitted:
        available.length +
        local.length -
        uniqueAvailable.length -
        localTools.length,
    };
  }
  const request = words(requestText);
  const candidates = uniqueAvailable
    .map((tool, index) => ({ tool, index, score: relevance(tool, request) }))
    .sort(
      (a, b) =>
        // Account, agent, space, and MCP tools are configured for this agent;
        // the platform catalog is shared by every agent and can be trimmed.
        Number(b.tool.category !== 'platform') -
          Number(a.tool.category !== 'platform') ||
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
    omitted:
      available.length + local.length - selected.length - localTools.length,
  };
}
