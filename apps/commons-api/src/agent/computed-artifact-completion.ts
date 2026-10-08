import { requiresComputedData } from '@agent-commons/agent-core';

type ExecutedCall = { name: string; status: string; result: unknown };
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

/** Only enforce computed files explicitly requested as durable Library outputs.
 * Read/list results and files from earlier runs are input evidence, not creation. */
export function missingComputedArtifacts(
  request: string,
  inputNames: string[],
  calls: ExecutedCall[],
): string[] {
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
    !requiresComputedData(request) ||
    !/\b(?:library|artifacts?|downloads?|downloadable)\b/i.test(request)
  )
    return [];
  const outputVerb = /\b(?:save|export|create|generate|write)\b/i.exec(request);
  if (!outputVerb) return [];
  const outputText = request.slice(outputVerb.index);
  const inputs = new Set(
    inputNames.map((name) => name.split(/[\\/]/).at(-1)?.toLowerCase()),
  );
  const expected = [
    ...new Set(
      [
        ...outputText.matchAll(
          /\b[\w-][\w.-]*\.(?:json|csv|png|jpg|jpeg|svg|pdf|xlsx|html|md|txt|pkl|pt|onnx)\b/gi,
        ),
      ].map((match) => match[0].toLowerCase()),
    ),
  ].filter((name) => !inputs.has(name));
  if (
    !expected.length &&
    !/\b(?:save|export)\b|\b(?:create|generate|write)\b.{0,100}\b(?:files?|outputs?|charts?|plots?|reports?)\b/i.test(
      outputText,
    )
  )
    return [];
  const produced = new Set<string>();
  for (const call of calls) {
    const data = unwrap(call.result);
    // Approval requests legitimately end a turn without activating resources.
    if (data.requiresConfirmation === true || data.requiresApproval === true)
      return [];
    if (
      call.status !== 'success' ||
      !/^(?:runPythonAnalysis|create(?:Text|Document|Presentation|Pdf|Spreadsheet)File)$/.test(
        call.name,
      )
    )
      continue;
    if (call.name === 'runPythonAnalysis' && data.exitCode !== 0) continue;
    for (const file of [
      ...(Array.isArray(data.artifacts) ? data.artifacts : []),
      ...(data.fileId ? [data] : []),
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
