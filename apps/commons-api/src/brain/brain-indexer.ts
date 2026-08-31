import { posix } from 'node:path';
import { JSON_SCHEMA, load } from 'js-yaml';

export type ParsedKnowledgeLink = {
  target: string;
  label?: string;
  relation: 'wikilink' | 'markdown' | 'frontmatter';
};

export type OkfTrustTier =
  | 'unverified'
  | 'machine-confirmed'
  | 'human-reviewed';

export type OkfDocumentAnalysis = {
  version: '0.2';
  kind: 'concept' | 'index' | 'log';
  conceptId?: string;
  conformant: boolean;
  issues: string[];
  type?: string;
  description?: string;
  resource?: string;
  status?: 'draft' | 'stable' | 'deprecated';
  staleAfter?: string;
  isStale: boolean;
  trustTier: OkfTrustTier;
  generatedBy?: string;
  verifiedBy: string[];
  sourceCount: number;
};

export function decideFilesystemMerge(input: {
  contentMatches: boolean;
  remoteActorType?: string | null;
  lastLocalRevision?: string | null;
  incomingLocalRevision?: string | null;
}): 'unchanged' | 'keep_remote' | 'accept_local' | 'conflict' {
  if (input.contentMatches) return 'unchanged';
  if (
    input.remoteActorType !== 'agent' ||
    !input.lastLocalRevision ||
    !input.incomingLocalRevision
  ) {
    return 'accept_local';
  }
  return input.lastLocalRevision === input.incomingLocalRevision
    ? 'keep_remote'
    : 'conflict';
}

export function normalizeDocumentPath(value: string) {
  const decoded = safelyDecode(value.trim())
    // Markdown serializers may escape punctuation in a displayed filename.
    // Treat those escapes as punctuation, while retaining Windows separators.
    .replace(/\\([.!()[\]{}#*_`~-])/g, '$1')
    .replace(/\\/g, '/');
  if (!decoded) throw new Error('Document path is required');
  if (decoded.includes('\0')) throw new Error('Document path is invalid');
  const pieces = decoded
    .replace(/^\/+/, '')
    .split('/')
    .filter((piece) => piece && piece !== '.');
  if (pieces.some((piece) => piece === '..')) {
    throw new Error('Document path cannot leave its Knowledge Space');
  }
  let path = pieces.join('/');
  if (!path.toLowerCase().endsWith('.md')) path += '.md';
  if (path.length > 512) throw new Error('Document path is too long');
  return path;
}

export function normalizeFolderPath(value: string) {
  const decoded = safelyDecode(value.trim()).replace(/\\/g, '/');
  if (!decoded) throw new Error('Folder path is required');
  if (decoded.includes('\0')) throw new Error('Folder path is invalid');
  const pieces = decoded
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((piece) => piece && piece !== '.');
  if (pieces.some((piece) => piece === '..')) {
    throw new Error('Folder path cannot leave its Knowledge Space');
  }
  const path = pieces.join('/');
  if (!path) throw new Error('Folder path is required');
  if (path.length > 480) throw new Error('Folder path is too long');
  return path;
}

export function titleFromPath(path: string) {
  return posix.basename(path, posix.extname(path)).replace(/[-_]+/g, ' ');
}

export function parseMarkdownDocument(content: string, path = 'note.md') {
  const { frontmatter, body, error } = parseFrontmatter(content);
  const tags = collectTags(frontmatter, body);
  const links = collectLinks(body, frontmatter);
  const okf = analyzeOkfDocument(path, frontmatter, body, error);
  return { frontmatter, tags, links, body, okf };
}

/**
 * Read-only OKF v0.2 analysis. Generic Markdown remains valid Knowledge Space
 * content; this metadata tells callers whether a document is portable as an
 * Open Knowledge Format concept without locking the store to that standard.
 */
export function analyzeOkfDocument(
  path: string,
  frontmatter: Record<string, unknown>,
  body: string,
  parseError?: string,
  now = new Date(),
): OkfDocumentAnalysis {
  const filename = posix.basename(path);
  const kind =
    filename === 'index.md'
      ? 'index'
      : filename === 'log.md'
        ? 'log'
        : 'concept';
  const issues: string[] = [];
  if (parseError) issues.push(`Invalid YAML frontmatter: ${parseError}`);

  if (kind === 'concept') {
    if (!nonEmptyString(frontmatter.type)) {
      issues.push('Concept documents require a non-empty type field');
    }
  } else if (kind === 'index') {
    const keys = Object.keys(frontmatter);
    const atBundleRoot = !path.includes('/');
    if (
      keys.length &&
      (!atBundleRoot || keys.some((key) => key !== 'okf_version'))
    ) {
      issues.push(
        'index.md must not contain frontmatter except okf_version at the bundle root',
      );
    }
  } else {
    if (Object.keys(frontmatter).length) {
      issues.push('log.md must not contain frontmatter');
    }
    for (const match of body.matchAll(/^##\s+(.+)\s*$/gm)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(match[1].trim())) {
        issues.push('log.md level-two headings must use YYYY-MM-DD dates');
        break;
      }
    }
  }

  const generated = asRecord(frontmatter.generated);
  if (generated && !nonEmptyString(generated.by)) {
    issues.push('generated.by is required when generated is present');
  }
  const verified = normalizeRecords(frontmatter.verified);
  if (
    frontmatter.verified !== undefined &&
    (!verified.length || verified.some((entry) => !nonEmptyString(entry.by)))
  ) {
    issues.push('Every verified entry requires a by actor');
  }
  const verifiedBy = verified
    .map((entry) => stringValue(entry.by))
    .filter((value): value is string => Boolean(value));
  const trustTier: OkfTrustTier = verifiedBy.some((actor) =>
    actor.startsWith('human:'),
  )
    ? 'human-reviewed'
    : verifiedBy.length
      ? 'machine-confirmed'
      : 'unverified';

  const sources = normalizeRecords(frontmatter.sources);
  if (
    frontmatter.sources !== undefined &&
    (!sources.length ||
      sources.some((source) => !nonEmptyString(source.resource)))
  ) {
    issues.push('Every sources entry requires a resource');
  }
  const statusValue = stringValue(frontmatter.status) ?? 'stable';
  const status = ['draft', 'stable', 'deprecated'].includes(statusValue)
    ? (statusValue as 'draft' | 'stable' | 'deprecated')
    : undefined;
  if (!status) issues.push('status must be draft, stable, or deprecated');

  const staleAfter = dateTimeValue(frontmatter.stale_after);
  if (frontmatter.stale_after !== undefined && !staleAfter) {
    issues.push('stale_after must be an ISO 8601 datetime with a UTC offset');
  }
  if (stringValue(frontmatter.type) === 'Attested Computation') {
    if (!nonEmptyString(frontmatter.runtime)) {
      issues.push('Attested Computation concepts require runtime');
    }
  }

  return {
    version: '0.2',
    kind,
    ...(kind === 'concept'
      ? { conceptId: normalizeDocumentPath(path).replace(/\.md$/i, '') }
      : {}),
    conformant: !issues.length,
    issues,
    type: stringValue(frontmatter.type),
    description: stringValue(frontmatter.description),
    resource: stringValue(frontmatter.resource),
    status,
    staleAfter,
    isStale: Boolean(staleAfter && now.getTime() >= Date.parse(staleAfter)),
    trustTier,
    generatedBy: generated ? stringValue(generated.by) : undefined,
    verifiedBy,
    sourceCount: sources.length,
  };
}

export function chunkMarkdown(
  title: string,
  content: string,
  targetChars = 2_200,
  overlapChars = 240,
) {
  const { body } = parseFrontmatter(content);
  const sections: Array<{ heading?: string; text: string }> = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
      lines.push(line);
    } else {
      lines.push(line);
    }
  }
  flush();
  if (!sections.length && body.trim()) sections.push({ text: body.trim() });

  const chunks: Array<{
    chunkIndex: number;
    heading?: string;
    content: string;
    tokenCount: number;
  }> = [];
  for (const section of sections) {
    const prefix = `# ${title}${
      section.heading ? `\n\nContext: ${section.heading}` : ''
    }\n\n`;
    const available = Math.max(600, targetChars - prefix.length);
    let cursor = 0;
    while (cursor < section.text.length) {
      let end = Math.min(section.text.length, cursor + available);
      if (end < section.text.length) {
        const boundary = section.text.lastIndexOf('\n\n', end);
        if (boundary > cursor + Math.floor(available * 0.55)) end = boundary;
      }
      const text = `${prefix}${section.text.slice(cursor, end).trim()}`.trim();
      if (text) {
        chunks.push({
          chunkIndex: chunks.length,
          heading: section.heading,
          content: text,
          tokenCount: Math.max(1, Math.ceil(text.length / 4)),
        });
      }
      if (end >= section.text.length) break;
      cursor = Math.max(cursor + 1, end - overlapChars);
    }
  }
  return chunks;
}

export function resolveLinkPath(fromPath: string, target: string) {
  const withoutAnchor = target.split('#')[0]?.split('^')[0]?.trim() ?? '';
  if (!withoutAnchor) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(withoutAnchor)) return '';
  const decoded = safelyDecode(withoutAnchor).replace(/\\/g, '/');
  const relative =
    decoded.startsWith('./') || decoded.startsWith('../')
      ? posix.join(posix.dirname(fromPath), decoded)
      : decoded.includes('/')
        ? decoded
        : posix.join(posix.dirname(fromPath), decoded);
  try {
    return normalizeDocumentPath(posix.normalize(relative));
  } catch {
    return '';
  }
}

export function documentAliases(document: {
  path: string;
  title: string;
  frontmatter?: Record<string, unknown> | null;
}) {
  const values = new Set<string>([
    document.path,
    document.path.replace(/\.md$/i, ''),
    posix.basename(document.path),
    posix.basename(document.path, '.md'),
    document.title,
  ]);
  const aliases = document.frontmatter?.aliases;
  for (const alias of asStrings(aliases)) values.add(alias);
  return [...values].map(normalizeKnowledgeAlias).filter(Boolean);
}

export function buildDocumentAliasMap<
  T extends {
    documentId: string;
    path: string;
    title: string;
    frontmatter?: Record<string, unknown> | null;
  },
>(documents: T[]) {
  const aliases = new Map<string, string | null>();
  for (const document of documents) {
    for (const alias of documentAliases(document)) {
      if (!aliases.has(alias)) {
        aliases.set(alias, document.documentId);
      } else if (aliases.get(alias) !== document.documentId) {
        aliases.set(alias, null);
      }
    }
  }
  return aliases;
}

export function normalizeKnowledgeAlias(value: string) {
  return safelyDecode(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.md$/i, '')
    .toLowerCase();
}

function parseFrontmatter(content: string) {
  if (!/^---\s*\r?\n/.test(content)) {
    return { frontmatter: {} as Record<string, unknown>, body: content };
  }
  const boundary = /^---\s*$/gm;
  boundary.lastIndex = content.indexOf('\n') + 1;
  const closing = boundary.exec(content);
  if (!closing) {
    return {
      frontmatter: {} as Record<string, unknown>,
      body: content,
      error: 'missing closing --- delimiter',
    };
  }
  const raw = content.slice(content.indexOf('\n') + 1, closing.index);
  const bodyStart = content.indexOf('\n', closing.index + closing[0].length);
  const body = bodyStart >= 0 ? content.slice(bodyStart + 1) : '';
  try {
    const parsed = load(raw, {
      schema: JSON_SCHEMA,
      json: true,
      maxAliases: 100,
      maxDepth: 50,
      maxTotalMergeKeys: 1_000,
    });
    if (parsed === undefined || parsed === null)
      return { frontmatter: {}, body };
    if (!asRecord(parsed)) {
      return {
        frontmatter: {} as Record<string, unknown>,
        body,
        error: 'frontmatter must be a YAML mapping',
      };
    }
    const frontmatter = JSON.parse(JSON.stringify(parsed)) as Record<
      string,
      unknown
    >;
    return { frontmatter, body };
  } catch (error) {
    return {
      frontmatter: {} as Record<string, unknown>,
      body,
      error:
        error instanceof Error ? error.message.split('\n')[0] : 'invalid YAML',
    };
  }
}

function collectTags(frontmatter: Record<string, unknown>, body: string) {
  const tags = new Set(
    asStrings(frontmatter.tags).map((tag) => tag.replace(/^#/, '').trim()),
  );
  for (const match of body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
    if (match[2]) tags.add(match[2]);
  }
  return [...tags].filter(Boolean).slice(0, 100);
}

function collectLinks(content: string, frontmatter: Record<string, unknown>) {
  const links: ParsedKnowledgeLink[] = [];
  const seen = new Set<string>();
  const add = (link: ParsedKnowledgeLink) => {
    const key = `${link.relation}:${link.target}:${link.label ?? ''}`;
    if (!link.target || seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };
  const linkSource = content.replace(/\\\[\\\[([^\]\n]+)\\\]\\\]/g, '[[$1]]');
  for (const match of linkSource.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const [target = '', label] = match[1].split('|', 2);
    add({ target: target.trim(), label: label?.trim(), relation: 'wikilink' });
  }
  for (const match of linkSource.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
    const target = match[2].trim();
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    add({ target, label: match[1].trim(), relation: 'markdown' });
  }
  for (const key of ['links', 'related']) {
    for (const target of asStrings(frontmatter[key])) {
      add({
        target: target.replace(/^\[\[|\]\]$/g, ''),
        relation: 'frontmatter',
      });
    }
  }
  const addResource = (value: unknown, label?: string) => {
    const target = stringValue(value);
    if (
      !target ||
      /^[a-z][a-z\d+.-]*:/i.test(target) ||
      (!target.startsWith('/') &&
        !target.startsWith('./') &&
        !target.startsWith('../') &&
        !target.toLowerCase().endsWith('.md'))
    )
      return;
    add({ target, label, relation: 'frontmatter' });
  };
  addResource(frontmatter.resource);
  addResource(frontmatter.computation);
  for (const source of normalizeRecords(frontmatter.sources)) {
    addResource(
      source.resource,
      stringValue(source.title) ?? stringValue(source.id),
    );
  }
  addResource(asRecord(frontmatter.executor)?.resource);
  addResource(asRecord(frontmatter.attester)?.resource);
  return links.slice(0, 500);
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(asStrings);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeRecords(value: unknown): Record<string, unknown>[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  return values
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function nonEmptyString(value: unknown) {
  return Boolean(stringValue(value));
}

function dateTimeValue(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate || !/(?:Z|[+-]\d{2}:\d{2})$/.test(candidate)) return undefined;
  return Number.isNaN(Date.parse(candidate)) ? undefined : candidate;
}

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
