import {
  buildDocumentAliasMap,
  chunkMarkdown,
  decideFilesystemMerge,
  documentAliases,
  normalizeDocumentPath,
  normalizeKnowledgeAlias,
  parseMarkdownDocument,
  resolveLinkPath,
  titleFromPath,
} from './brain-indexer';

describe('Knowledge Markdown indexer', () => {
  describe('portable paths', () => {
    it('normalizes separators, encoded names, and missing extensions', () => {
      expect(normalizeDocumentPath(' /Projects\\Launch%20plan ')).toBe(
        'Projects/Launch plan.md',
      );
      expect(titleFromPath('Projects/launch-plan.md')).toBe('launch plan');
    });

    it.each(['../secret.md', 'Projects/../../secret', '%2e%2e/secret'])(
      'rejects traversal in %s',
      (path) =>
        expect(() => normalizeDocumentPath(path)).toThrow(/cannot leave/),
    );
  });

  it('extracts portable properties, tags, wikilinks, and Markdown links', () => {
    const parsed = parseMarkdownDocument(`---
tags: [strategy, north-star]
aliases:
  - Launch truth
related: [[Decisions/Go to market]]
---
# Launch plan

Discuss with [[People/Amina|Amina]] and read [brief](../Reference/Brief.md).
Status is #active.
`);

    expect(parsed.frontmatter.aliases).toEqual(['Launch truth']);
    expect(parsed.tags).toEqual(
      expect.arrayContaining(['strategy', 'north-star', 'active']),
    );
    expect(parsed.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'People/Amina',
          label: 'Amina',
          relation: 'wikilink',
        }),
        expect.objectContaining({
          target: '../Reference/Brief.md',
          relation: 'markdown',
        }),
        expect.objectContaining({
          target: 'Decisions/Go to market',
          relation: 'frontmatter',
        }),
      ]),
    );
  });

  it('resolves relative links while retaining Obsidian-style aliases', () => {
    expect(resolveLinkPath('Projects/Launch/Overview.md', '../Brief')).toBe(
      'Projects/Brief.md',
    );
    expect(resolveLinkPath('Projects/Launch/Overview.md', 'Decision')).toBe(
      'Projects/Launch/Decision.md',
    );
    expect(
      resolveLinkPath('Projects/Launch/Overview.md', 'https://acme.test'),
    ).toBe('');

    const aliases = documentAliases({
      path: 'Decisions/Go-to-market.md',
      title: 'Go to market',
      frontmatter: { aliases: ['GTM call'] },
    });
    expect(aliases).toEqual(
      expect.arrayContaining([
        normalizeKnowledgeAlias('Decisions/Go-to-market'),
        normalizeKnowledgeAlias('Go-to-market'),
        normalizeKnowledgeAlias('GTM call'),
      ]),
    );
  });

  it('leaves duplicate basenames unresolved instead of picking arbitrarily', () => {
    const aliases = buildDocumentAliasMap([
      {
        documentId: 'one',
        path: 'Customers/Overview.md',
        title: 'Customer overview',
      },
      {
        documentId: 'two',
        path: 'Projects/Overview.md',
        title: 'Project overview',
      },
      {
        documentId: 'three',
        path: 'Teams/Overview.md',
        title: 'Team overview',
      },
    ]);

    expect(aliases.get('overview')).toBeNull();
    expect(aliases.get('customers/overview')).toBe('one');
    expect(aliases.get('projects/overview')).toBe('two');
  });

  it('creates heading-aware, overlapping retrieval units with stable positions', () => {
    const longParagraph = 'knowledge graph retrieval provenance '.repeat(180);
    const chunks = chunkMarkdown(
      'System design',
      `# Overview\n\n${longParagraph}\n\n## Decisions\n\n${longParagraph}`,
      900,
      100,
    );

    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks.some((chunk) => chunk.heading === 'Overview')).toBe(true);
    expect(chunks.some((chunk) => chunk.heading === 'Decisions')).toBe(true);
    expect(
      chunks.every((chunk) => chunk.content.startsWith('# System design')),
    ).toBe(true);
  });

  it('does not silently overwrite agent edits during folder sync', () => {
    expect(
      decideFilesystemMerge({
        contentMatches: false,
        remoteActorType: 'agent',
        lastLocalRevision: '2026-08-28T10:00:00.000Z',
        incomingLocalRevision: '2026-08-28T10:00:00.000Z',
      }),
    ).toBe('keep_remote');
    expect(
      decideFilesystemMerge({
        contentMatches: false,
        remoteActorType: 'agent',
        lastLocalRevision: '2026-08-28T10:00:00.000Z',
        incomingLocalRevision: '2026-08-28T11:00:00.000Z',
      }),
    ).toBe('conflict');
    expect(
      decideFilesystemMerge({
        contentMatches: false,
        remoteActorType: 'user',
        lastLocalRevision: 'one',
        incomingLocalRevision: 'two',
      }),
    ).toBe('accept_local');
  });
});
