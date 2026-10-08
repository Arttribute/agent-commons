// Separate explicitly requested outputs from filenames mentioned as references.
export function requestedFileOutputs(prompt: string, inputNames: string[] = []) {
  const inputs = new Set(inputNames.map((name) => name.split(/[\\/]/).at(-1)?.toLowerCase()));
  const names = new Set<string>();
  for (const match of prompt.matchAll(/\b([\w-]+\.(?:md|txt|html|json|csv|png|js|css|svg|pdf|docx|pptx|xlsx))\b/gi)) {
    const filename = match[1];
    const prefix = prompt.slice(0, match.index);
    const actions = [...prefix.matchAll(/\b(save|write|draft|create|produce|generate|export|named|read|inspect|use|open|load)\b/gi)];
    const action = actions.at(-1)?.[1].toLowerCase();
    if (action && !['read', 'inspect', 'use', 'open', 'load'].includes(action) && !inputs.has(filename.toLowerCase())) names.add(filename);
  }
  return [...names];
}
