import { posix } from 'node:path';

export type ParsedKnowledgeLink = {
  target: string;
  label?: string;
  relation: 'wikilink' | 'markdown' | 'frontmatter';
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
  const decoded = safelyDecode(value.trim()).replace(/\\/g, '/');
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

export function titleFromPath(path: string) {
  return posix.basename(path, posix.extname(path)).replace(/[-_]+/g, ' ');
}

export function parseMarkdownDocument(content: string) {
  const { frontmatter, body } = parseFrontmatter(content);
  const tags = collectTags(frontmatter, body);
  const links = collectLinks(body, frontmatter);
  return { frontmatter, tags, links, body };
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
    const prefix = `# ${title}${section.heading ? `\n\nContext: ${section.heading}` : ''}\n\n`;
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
  const end = content.indexOf('\n---', 4);
  if (end < 0) {
    return { frontmatter: {} as Record<string, unknown>, body: content };
  }
  const raw = content.slice(content.indexOf('\n') + 1, end);
  const frontmatter: Record<string, unknown> = {};
  let listKey: string | undefined;
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const listItem = /^-\s+(.+)$/.exec(line);
    if (listItem && listKey) {
      const list = Array.isArray(frontmatter[listKey])
        ? (frontmatter[listKey] as unknown[])
        : [];
      list.push(parseScalar(listItem[1]));
      frontmatter[listKey] = list;
      continue;
    }
    const pair = /^([\w.-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    listKey = pair[1];
    frontmatter[listKey] = pair[2] ? parseScalar(pair[2]) : [];
  }
  const bodyStart = content.indexOf('\n', end + 1);
  return {
    frontmatter,
    body: bodyStart >= 0 ? content.slice(bodyStart + 1) : '',
  };
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (/^\[(?!\[).*\]$/.test(trimmed)) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
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
  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const [target = '', label] = match[1].split('|', 2);
    add({ target: target.trim(), label: label?.trim(), relation: 'wikilink' });
  }
  for (const match of content.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
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
  return links.slice(0, 500);
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(asStrings);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
