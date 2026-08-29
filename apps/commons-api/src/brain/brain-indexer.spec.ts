import {
  buildDocumentAliasMap,
  chunkMarkdown,
  decideFilesystemMerge,
  documentAliases,
  normalizeDocumentPath,
  normalizeFolderPath,
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
      expect(normalizeDocumentPath('Projects/Overview\\.md')).toBe(
        'Projects/Overview.md',
      );
    });

    it.each(['../secret.md', 'Projects/../../secret', '%2e%2e/secret'])(
      'rejects traversal in %s',
      (path) =>
        expect(() => normalizeDocumentPath(path)).toThrow(/cannot leave/),
    );

    it('normalizes durable folder paths without adding a file extension', () => {
      expect(normalizeFolderPath(' /Projects\\Launch%20notes/ ')).toBe(
        'Projects/Launch notes',
      );
      expect(() => normalizeFolderPath('../outside')).toThrow(/cannot leave/);
      expect(() => normalizeFolderPath('')).toThrow(/required/);
    });
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

  it('recovers wikilinks escaped by a visual Markdown serializer', () => {
    const parsed = parseMarkdownDocument(
      String.raw`See \[\[30-decisions/2026-08-24-minimum-lot-size\]\].`,
    );
    expect(parsed.links).toContainEqual({
      target: '30-decisions/2026-08-24-minimum-lot-size',
      label: undefined,
      relation: 'wikilink',
    });
  });

  it('parses nested OKF v0.2 provenance, trust, and lifecycle metadata', () => {
    const parsed = parseMarkdownDocument(
      `---
type: Metric
title: Weekly active users
description: Active users in the trailing seven-day window.
status: stable
stale_after: 2027-01-01T00:00:00Z
generated: { by: knowledge_compiler/v1, at: 2026-08-28T12:00:00Z }
verified:
  - { by: process:metrics-nightly, at: 2026-08-28T13:00:00Z }
  - { by: human:amina, at: 2026-08-28T14:00:00Z }
sources:
  - id: metric-policy
    resource: /Reference/Metric policy.md
    title: Metric policy
    author: team:data
---
# Definition

See [the computation](/Computations/WAU.md).[^metric-policy]
`,
      'Metrics/Weekly active users.md',
    );

    expect(parsed.frontmatter.sources).toEqual([
      expect.objectContaining({
        id: 'metric-policy',
        resource: '/Reference/Metric policy.md',
      }),
    ]);
    expect(parsed.okf).toMatchObject({
      version: '0.2',
      kind: 'concept',
      conceptId: 'Metrics/Weekly active users',
      conformant: true,
      type: 'Metric',
      status: 'stable',
      trustTier: 'human-reviewed',
      sourceCount: 1,
      isStale: false,
    });
    expect(parsed.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: '/Reference/Metric policy.md',
          relation: 'frontmatter',
        }),
        expect.objectContaining({
          target: '/Computations/WAU.md',
          relation: 'markdown',
        }),
      ]),
    );
  });

  it('keeps generic Markdown readable while explaining OKF incompatibility', () => {
    const markdown = parseMarkdownDocument('# Plain note', 'Notes/Plain.md');
    expect(markdown.okf).toMatchObject({
      conformant: false,
      issues: ['Concept documents require a non-empty type field'],
    });

    const malformed = parseMarkdownDocument(
      '---\ntype: [broken\n---\n# Note',
      'Notes/Broken.md',
    );
    expect(malformed.body).toBe('# Note');
    expect(malformed.okf.conformant).toBe(false);
    expect(malformed.okf.issues[0]).toMatch(/Invalid YAML frontmatter/);
  });

  it('recognizes OKF index and log reserved documents', () => {
    expect(
      parseMarkdownDocument('---\nokf_version: "0.2"\n---\n# Index', 'index.md')
        .okf,
    ).toMatchObject({ kind: 'index', conformant: true });
    expect(
      parseMarkdownDocument(
        '# Update log\n\n## Recently\n* Added note',
        'log.md',
      ).okf,
    ).toMatchObject({
      kind: 'log',
      conformant: false,
      issues: ['log.md level-two headings must use YYYY-MM-DD dates'],
    });
  });

  it('does not turn an OKF source scope descriptor into a broken graph link', () => {
    const parsed = parseMarkdownDocument(
      `---
type: Dataset
sources:
  - resource: all queries in BigQuery project acme
---
# Dataset
`,
      'Data/Dataset.md',
    );
    expect(parsed.okf.conformant).toBe(true);
    expect(parsed.links).toEqual([]);
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
