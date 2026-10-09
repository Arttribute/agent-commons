import { affirmativeOutputRequest, requiresComputedData, requestedFileOutputs } from '@agent-commons/agent-core';

type ExecutedCall = { name: string; status: string; result: unknown };

/** Library-only work should use publishing tools, rather than silently leaving
 * requested artifacts in a computer folder. Explicit terminal and folder work
 * retains the user's command tools. */
export function preferManagedArtifactTools(request: string, hasSelectedFolder = false): boolean {
  if (hasSelectedFolder || /\b(?:shell|terminal|runComputerCommand|writeComputerFiles|npm|npx|pnpm|yarn|node(?:\.js)?|docker|git|ffmpeg|bash|zsh|next(?:\.js|js)|react)\b/i.test(request)) return false;
  return missingComputedArtifacts(request, [], []).length > 0;
}

function unwrap(value: any): any {
  for (let depth = 0; depth < 5; depth++) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return {};
      }
    }
    if (value?.toolData !== undefined) value = value.toolData;
    else if (value?.data !== undefined) value = value.data;
    else break;
  }
  return value ?? {};
}

/** Enforce requested Library files and cloud computation outputs.
 * Read/list results and files from earlier runs are input evidence, not creation. */
export function missingComputedArtifacts(
  request: string,
  inputNames: string[],
  calls: ExecutedCall[],
  hasSelectedFolder = false,
): string[] {
  request = affirmativeOutputRequest(request);
  if (
    /^(?:explain|describe|how\b|tell me how|show me how)/i.test(
      request.trim(),
    ) &&
    !/\b(?:then|also|and)\s+(?:save|export|create|generate|write)\b/i.test(
      request,
    )
  )
    return [];
  if (
    !/\b(?:library|artifacts?|downloads?|downloadable)\b/i.test(request) &&
    (hasSelectedFolder || !requiresComputedData(request))
  )
    return [];
  const outputVerb = /\b(?:save|export|create|generate|write|produce|draft)\b/i.exec(request);
  if (!outputVerb) return [];
  const outputText = request.slice(outputVerb.index);
  const expected = requestedFileOutputs(request, inputNames).map(name => name.toLowerCase());
  if (
    !expected.length &&
    !/\b(?:save|export)\b|\b(?:create|generate|write)\b.{0,100}\b(?:files?|outputs?|charts?|plots?|reports?)\b/i.test(
      outputText,
    )
  )
    return [];
  const produced = new Set<string>();
  const computed = requiresComputedData(request);
  for (const call of calls) {
    const data = unwrap(call.result);
    // Approval requests legitimately end a turn without activating resources.
    if (data.requiresConfirmation === true || data.requiresApproval === true)
      return [];
    const dataFileCreation = /^(?:runPythonAnalysis|create(?:Text|Document|Presentation|Pdf|Spreadsheet)File)$/.test(call.name);
    const mediaCreation = !computed && /^(?:generateImage|generateMedia)$/.test(call.name);
    if (call.status !== 'success' || (!dataFileCreation && !mediaCreation))
      continue;
    if (call.name === 'runPythonAnalysis' && data.exitCode !== 0) continue;
    for (const file of Array.isArray(data) ? data : [
      ...(Array.isArray(data.artifacts) ? data.artifacts : []),
      ...(data.fileId ? [data] : []),
      ...(data.artifact?.itemId ? [{ fileId: data.artifact.itemId, name: data.artifact.name }] : []),
    ]) {
      if (file.fileId && typeof file.name === 'string')
        produced.add(file.name.split(/[\\/]/).at(-1)!.toLowerCase());
    }
  }
  return expected.length
    ? expected.filter((name) => !produced.has(name))
    : produced.size
      ? []
      : ['a newly generated Library output'];
}
