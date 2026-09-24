/** Detect model text that pretends to be a tool invocation. */
export function looksLikeInventedToolCall(content: string): boolean {
  const match = content.trim().match(/^(?:```(?:json|tool)?\s*)?(\{[\s\S]*\})(?:\s*```)?$/i);
  if (!match) return false;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    return (typeof value.name === "string" && typeof value.arguments === "object")
      || (typeof value.tool === "string" && typeof value.args === "object");
  } catch {
    return false;
  }
}

export function parseToolArguments(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return parseToolArguments(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function assistantIdentityRequestKind(prompt: string): "name" | "about" | null {
  const question = prompt.trim().replace(/[?.!]+$/, "").trim().toLowerCase();
  if (/\b(?:model|llm|engine|provider|gemma|qwen|llama)\b/.test(question)) return null;
  if (/^(?:(?:hi|hello|hey)[,!\s]+)?(?:what(?:'s| is) your name|tell me your name|what should i call you|how should i address you|who am i (?:talking|speaking) to|do you (?:know|remember) your name)(?:\s+(?:here|locally|in local mode))?$/.test(question)) return "name";
  if (/^(?:(?:hi|hello|hey)[,!\s]+)?(?:who are you|what are you|what is your (?:role|identity)|do you know who you are|what kind of assistant are you|tell me (?:something |more )?about yourself|introduce yourself|what can you (?:do|help me with))(?:\s+(?:here|locally|in local mode))?$/.test(question)) return "about";
  return null;
}

export function isAssistantIdentityRequest(prompt: string): boolean {
  return assistantIdentityRequestKind(prompt) !== null;
}

export function looksLikeModelIdentity(content: string): boolean {
  return /\b(?:I am|I'm|my name is|you can call me)\s+(?:Gemma|Qwen|Llama|DeepSeek|GPT|Claude|Phi|Mistral|an? (?:large )?language model)\b/i.test(content);
}

export function assistantNameAnswer(name: string): string {
  return `My name is ${name}.`;
}

export function assistantIdentityAnswer(name: string, model: string): string {
  return `I'm ${name}, your Agent Commons assistant running in Private Local mode on this computer. ${model ? `I'm powered by the local ${model} model. ` : ""}I can answer questions, use your local Knowledge Spaces and skills, work with files in a selected folder, and run commands with your approval.`;
}
