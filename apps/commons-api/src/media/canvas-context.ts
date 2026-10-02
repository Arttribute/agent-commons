/**
 * Agent context for an artifact open in the canvas.
 *
 * The canvas sends a small, untrusted hint (which canvas, which notes, what the
 * viewer shows). The service reloads everything it puts in front of the model,
 * so these helpers only shape data that has already passed an access check.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CANVAS_MEDIA_KINDS = ['image', 'video', 'audio', 'music'] as const;
export type CanvasMediaKind = (typeof CANVAS_MEDIA_KINDS)[number];

export type CanvasCreativeDefaults = Partial<
  Record<
    CanvasMediaKind,
    { modelKey?: string; settings?: Record<string, unknown> }
  >
>;

export type CanvasViewerHint = {
  view?: 'preview' | 'source';
  page?: number;
  pageCount?: number;
  sheet?: string;
  timeMs?: number;
  durationMs?: number;
  sourceFile?: string;
};

export type CanvasContextRequest = {
  projectId: string;
  annotationIds: string[];
  viewer: CanvasViewerHint;
};

/** Read the canvas fields of a run's UI context. Returns null for other pages. */
export function canvasContextRequest(
  uiContext: unknown,
): CanvasContextRequest | null {
  if (!uiContext || typeof uiContext !== 'object') return null;
  const input = uiContext as Record<string, unknown>;
  if (input.resourceType !== 'canvas') return null;
  const projectId =
    typeof input.resourceId === 'string' ? input.resourceId.trim() : '';
  if (!UUID.test(projectId)) return null;
  const ids = [
    ...(Array.isArray(input.annotationIds) ? input.annotationIds : []),
    input.annotationId,
  ].filter(
    (value): value is string => typeof value === 'string' && UUID.test(value),
  );
  const viewer =
    input.canvasViewer && typeof input.canvasViewer === 'object'
      ? (input.canvasViewer as Record<string, unknown>)
      : {};
  const count = (value: unknown, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.min(Math.round(value), max)
      : undefined;
  const label = (value: unknown, max: number) =>
    typeof value === 'string' && value.trim()
      ? value.trim().slice(0, max)
      : undefined;
  return {
    projectId,
    annotationIds: [...new Set(ids)].slice(0, 20),
    viewer: {
      view: viewer.view === 'source' ? 'source' : viewer.view === 'preview' ? 'preview' : undefined,
      page: count(viewer.page, 100_000),
      pageCount: count(viewer.pageCount, 100_000),
      sheet: label(viewer.sheet, 120),
      timeMs: count(viewer.timeMs, 86_400_000),
      durationMs: count(viewer.durationMs, 86_400_000),
      sourceFile: label(viewer.sourceFile, 300),
    },
  };
}

/** Keep only well-formed creative preferences, bounded in size. */
export function normalizeCreativeDefaults(
  value: unknown,
): CanvasCreativeDefaults {
  if (!value || typeof value !== 'object') return {};
  const result: CanvasCreativeDefaults = {};
  for (const kind of CANVAS_MEDIA_KINDS) {
    const entry = (value as Record<string, unknown>)[kind];
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const modelKey =
      typeof record.modelKey === 'string'
        ? record.modelKey.trim().slice(0, 160)
        : undefined;
    const settings =
      record.settings && typeof record.settings === 'object'
        ? Object.fromEntries(
            Object.entries(record.settings as Record<string, unknown>)
              .filter(
                ([key, item]) =>
                  /^[a-zA-Z0-9_.-]{1,64}$/.test(key) &&
                  ['string', 'number', 'boolean'].includes(typeof item),
              )
              .slice(0, 24)
              .map(([key, item]) => [
                key,
                typeof item === 'string' ? item.slice(0, 300) : item,
              ]),
          )
        : undefined;
    if (modelKey || (settings && Object.keys(settings).length)) {
      result[kind] = { modelKey, settings };
    }
  }
  return result;
}

export type ContextArtifact = {
  itemId: string;
  name: string;
  kind: string;
  mimeType: string;
  metadata?: Record<string, unknown> | null;
};

export type ContextRevision = {
  revisionId: string;
  itemId: string;
  operation: string;
  modelId?: string | null;
  createdByType: string;
  createdAt: Date | string;
};

export type ContextAnnotation = {
  annotationId: string;
  revisionId: string;
  kind: string;
  body: string;
  status: string;
  geometry?: Record<string, unknown> | null;
  startMs?: number | null;
  endMs?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type CanvasContextInput = {
  projectId: string;
  artifact: ContextArtifact;
  activeRevision?: ContextRevision;
  revisions: ContextRevision[];
  annotations: ContextAnnotation[];
  attachedIds: string[];
  viewer: CanvasViewerHint;
  creativeDefaults: CanvasCreativeDefaults;
  codeProject?: { projectId: string; entryFile: string; name: string } | null;
};

/** The system-prompt block for an agent working on a canvas artifact. */
export function formatCanvasContext(input: CanvasContextInput) {
  const { artifact, projectId } = input;
  const ordered = [...input.revisions].sort(
    (left, right) => time(left.createdAt) - time(right.createdAt),
  );
  const versionIndex = input.activeRevision
    ? ordered.findIndex(
        (revision) => revision.revisionId === input.activeRevision!.revisionId,
      ) + 1
    : ordered.length;
  const lines: string[] = [
    '## Canvas',
    'The user is looking at this artifact in the canvas. Treat it as the subject of their message unless they name something else.',
    `- Artifact: "${clip(artifact.name, 200)}" (${artifact.kind}, ${artifact.mimeType}), Library fileId ${artifact.itemId}`,
    `- Canvas projectId for canvas tools: ${projectId}`,
  ];
  if (ordered.length) {
    const active = input.activeRevision;
    lines.push(
      `- Showing version ${Math.max(versionIndex, 1)} of ${ordered.length}${
        active
          ? ` (revisionId ${active.revisionId}, ${describeRevision(active)})`
          : ''
      }`,
    );
  }
  const viewer = describeViewer(input.viewer);
  if (viewer) lines.push(`- Viewer: ${viewer}`);
  if (input.codeProject) {
    lines.push(
      `- Code project ${input.codeProject.projectId} ("${clip(input.codeProject.name, 120)}", entry ${input.codeProject.entryFile})`,
    );
  }

  const attached = input.attachedIds
    .map((id) => input.annotations.find((note) => note.annotationId === id))
    .filter((note): note is ContextAnnotation => Boolean(note));
  if (attached.length) {
    lines.push(
      '',
      '### Notes attached to this message',
      'The user selected these notes for this message. Their location data is exact; quote it rather than guessing.',
    );
    attached.forEach((note, index) => {
      lines.push(...formatNote(note, index + 1, ordered));
    });
  }

  const attachedSet = new Set(attached.map((note) => note.annotationId));
  const open = input.annotations.filter(
    (note) =>
      note.status === 'open' &&
      !attachedSet.has(note.annotationId) &&
      note.revisionId === input.activeRevision?.revisionId,
  );
  if (open.length) {
    lines.push('', `### Other open notes on this version (${open.length})`);
    open.slice(0, 12).forEach((note) => {
      const where = noteLocation(note);
      lines.push(
        `- ${note.annotationId}: "${clip(note.body, 200)}"${where ? ` (${where})` : ''}`,
      );
    });
    if (open.length > 12) lines.push(`- …and ${open.length - 12} more`);
  }

  const defaults = Object.entries(input.creativeDefaults).filter(
    ([, value]) => value?.modelKey || Object.keys(value?.settings ?? {}).length,
  );
  if (defaults.length) {
    lines.push(
      '',
      '### Creative tool preferences',
      'Use these for generateMedia on this canvas unless the user asks for something else.',
    );
    for (const [kind, value] of defaults) {
      const settings = Object.keys(value?.settings ?? {}).length
        ? ` with settings ${JSON.stringify(value!.settings)}`
        : '';
      lines.push(
        `- ${kind}: ${value?.modelKey ? `modelKey "${value.modelKey}"` : 'any suitable model'}${settings}`,
      );
    }
  }

  lines.push('', '### Changing this artifact', ...editGuidance(input));
  return lines.join('\n');
}

function editGuidance(input: CanvasContextInput) {
  const { artifact, projectId } = input;
  const media = mediaKind(artifact);
  const guidance: string[] = [];
  if (media === 'video' || media === 'audio' || media === 'music') {
    guidance.push(
      `- Before planning cuts, call analyzeMedia with projectId "${projectId}" for the timestamped transcript, silences and scene changes.`,
      `- For trims, cuts, joining clips, adding or replacing sound, volume, speed, crops, fades, captions and blurring a region, use editMedia with projectId "${projectId}". Use the exact millisecond times and frame boxes from the notes. The result becomes the next version.`,
      '- For background music or other sound, generate it with generateMedia (kind music or audio) and the same projectId: it is kept with this artifact as a source, not as a version. Then lay it in with editMedia addAudio. Offer a few variations when the user is choosing.',
      `- For generative changes (new shots, restyling, generated speech or music), use generateMedia with projectId "${projectId}" and inputItemIds ["${artifact.itemId}"].`,
    );
  } else if (media) {
    guidance.push(
      `- Use generateMedia with projectId "${projectId}", operation "transform" and inputItemIds ["${artifact.itemId}"] (add reference files after it). The output becomes the next version automatically.`,
      '- For a region note, describe the region precisely in the prompt and keep everything outside it unchanged.',
    );
  } else if (input.codeProject) {
    guidance.push(
      `- Read the source with readCodeProject (projectId "${input.codeProject.projectId}"), change it with writeCodeProjectFiles, and verify with testCodeProject when behaviour changes. The canvas preview reloads after each write.`,
      '- Element notes include CSS selectors and attributes from the rendered preview. Map them back to the source before editing.',
    );
  } else {
    guidance.push(
      `- Read the current version with readUploadedFile (fileId "${artifact.itemId}"). Create the revised file with the matching create*File tool, then call addCanvasVersion with projectId "${projectId}" and the new fileId so it becomes the next version.`,
    );
  }
  guidance.push(
    '- After you address a note, call updateCanvasNotes to mark it resolved.',
    '- Report only changes that a tool result confirms.',
  );
  return guidance;
}

function formatNote(
  note: ContextAnnotation,
  index: number,
  revisions: ContextRevision[],
) {
  const target = record(note.metadata?.target);
  const lines = [
    `${index}. Note ${note.annotationId}${note.status === 'resolved' ? ' (resolved)' : ''}: "${clip(note.body, 2_000)}"`,
  ];
  const version =
    revisions.findIndex((revision) => revision.revisionId === note.revisionId) +
    1;
  if (version) lines.push(`   On version ${version}`);
  const where = noteLocation(note);
  if (where) lines.push(`   Location: ${where}`);
  const type = text(target?.type, 20);
  if (type === 'text') {
    const quote = text(target?.quote, 4_000);
    if (quote) lines.push(`   Selected text: "${quote}"`);
    const prefix = verbatim(target?.prefix, 300, 'end');
    const suffix = verbatim(target?.suffix, 300, 'start');
    if (prefix || suffix) {
      lines.push(
        `   Surrounding text: "…${prefix ?? ''}[selection]${suffix ?? ''}…"`,
      );
    }
  } else if (type === 'region' || type === 'point') {
    const inside = text(target?.quote, 4_000);
    if (inside) lines.push(`   Text inside: "${inside}"`);
  } else if (type === 'cells') {
    const values = Array.isArray(target?.values)
      ? (target!.values as unknown[][])
          .slice(0, 50)
          .map((row) =>
            (Array.isArray(row) ? row : [])
              .slice(0, 26)
              .map((cell) => clip(String(cell ?? ''), 200))
              .join(' | '),
          )
      : [];
    if (values.length) {
      lines.push('   Cell values:', ...values.map((row) => `     ${row}`));
    }
  } else if (type === 'source') {
    const code = text(target?.code, 6_000);
    if (code) lines.push('   Selected source:', fence(code));
  } else if (type === 'element') {
    const elements = Array.isArray(target?.elements)
      ? (target!.elements as unknown[]).slice(0, 8)
      : [];
    elements.forEach((value, elementIndex) => {
      const element = record(value);
      if (!element) return;
      const parts = [
        text(element.selector, 400) && `selector \`${text(element.selector, 400)}\``,
        text(element.tag, 40) && `<${text(element.tag, 40)}>`,
        text(element.role, 60) && `role ${text(element.role, 60)}`,
        text(element.ariaLabel, 200) && `aria-label "${text(element.ariaLabel, 200)}"`,
        text(element.text, 400) && `text "${text(element.text, 400)}"`,
        text(element.src, 500) && `src ${text(element.src, 500)}`,
        text(element.alt, 200) && `alt "${text(element.alt, 200)}"`,
        text(element.href, 500) && `href ${text(element.href, 500)}`,
        text(element.icon, 120) && `icon ${text(element.icon, 120)}`,
        text(element.source, 400) && `source ${text(element.source, 400)}`,
      ].filter(Boolean);
      lines.push(`   Element ${elementIndex + 1}: ${parts.join(', ')}`);
      const html = text(element.html, 1_500);
      if (html) lines.push(fence(html, 'html'));
    });
  }
  const transcript = text(target?.transcript, 2_000);
  if (transcript) lines.push(`   Transcript at this moment: "${transcript}"`);
  return lines;
}

/** A short, human-readable location for a note. */
export function noteLocation(note: ContextAnnotation) {
  const target = record(note.metadata?.target);
  const parts: string[] = [];
  const page = number(target?.page);
  const pageLabel = text(target?.pageLabel, 20) ?? 'page';
  if (page) parts.push(`${pageLabel} ${page}`);
  const sheet = text(target?.sheet, 120);
  if (sheet) parts.push(`sheet "${sheet}"`);
  const range = text(target?.range, 40);
  if (range) parts.push(`cells ${range}`);
  const file = text(target?.file, 300);
  if (file) {
    const start = number(target?.lineStart);
    const end = number(target?.lineEnd);
    parts.push(
      start ? `${file} lines ${start}${end && end !== start ? `-${end}` : ''}` : file,
    );
  }
  if (typeof note.startMs === 'number') {
    parts.push(
      `${clock(note.startMs)}${typeof note.endMs === 'number' && note.endMs > note.startMs ? `-${clock(note.endMs)}` : ''}`,
    );
  }
  const geometry = record(note.geometry);
  const x = number(geometry?.x, true);
  const y = number(geometry?.y, true);
  if (x !== undefined && y !== undefined) {
    const width = number(geometry?.width, true);
    const height = number(geometry?.height, true);
    const size = record(note.metadata?.intrinsicSize);
    const naturalWidth = number(size?.width);
    const naturalHeight = number(size?.height);
    let spot =
      width !== undefined && height !== undefined
        ? `region x ${pct(x)} y ${pct(y)} w ${pct(width)} h ${pct(height)}`
        : `point x ${pct(x)} y ${pct(y)}`;
    if (naturalWidth && naturalHeight) {
      const px = (value: number, total: number) => Math.round(value * total);
      spot +=
        width !== undefined && height !== undefined
          ? ` (pixels ${px(x, naturalWidth)},${px(y, naturalHeight)} to ${px(x + width, naturalWidth)},${px(y + height, naturalHeight)} of ${naturalWidth}x${naturalHeight})`
          : ` (pixel ${px(x, naturalWidth)},${px(y, naturalHeight)} of ${naturalWidth}x${naturalHeight})`;
    }
    parts.push(spot);
  }
  return parts.join(', ');
}

function describeViewer(viewer: CanvasViewerHint) {
  const parts: string[] = [];
  if (viewer.view === 'source') parts.push('source code');
  if (viewer.sourceFile) parts.push(`file ${viewer.sourceFile}`);
  if (viewer.page) {
    parts.push(
      `page ${viewer.page}${viewer.pageCount ? ` of ${viewer.pageCount}` : ''}`,
    );
  }
  if (viewer.sheet) parts.push(`sheet "${viewer.sheet}"`);
  if (viewer.timeMs !== undefined && (viewer.durationMs || viewer.timeMs)) {
    parts.push(
      `playhead ${clock(viewer.timeMs)}${viewer.durationMs ? ` of ${clock(viewer.durationMs)}` : ''}`,
    );
  }
  return parts.join(', ');
}

function describeRevision(revision: ContextRevision) {
  const who =
    revision.createdByType === 'agent'
      ? 'an agent'
      : revision.createdByType === 'service'
        ? 'Commons'
        : 'the user';
  const action =
    revision.operation === 'import'
      ? 'original'
      : `${revision.operation} by ${who}`;
  return revision.modelId ? `${action} with ${revision.modelId}` : action;
}

function mediaKind(artifact: ContextArtifact): CanvasMediaKind | null {
  if (artifact.kind === 'music') return 'music';
  if (artifact.mimeType.startsWith('image/')) return 'image';
  if (artifact.mimeType.startsWith('video/')) return 'video';
  if (artifact.mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function fence(value: string, language = '') {
  const safe = value.replace(/```/g, '`​``');
  return `   \`\`\`${language}\n${safe
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')}\n   \`\`\``;
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? clip(value.trim(), max)
    : undefined;
}

/** Context text whose edge whitespace matters, clipped away from the selection. */
function verbatim(value: unknown, max: number, keep: 'start' | 'end') {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (value.length <= max) return value;
  return keep === 'start' ? value.slice(0, max) : value.slice(-max);
}

function number(value: unknown, allowZero = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (!allowZero && value <= 0) return undefined;
  return value;
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}${tenths ? `.${tenths}` : ''}`;
}

function time(value: Date | string) {
  return new Date(value).getTime();
}
