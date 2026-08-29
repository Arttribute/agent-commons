# Knowledge Spaces

Status: implemented for staging in migrations `027_knowledge_spaces.sql` and
`028_knowledge_folders.sql`.

## Product boundary

Agent Commons calls the feature **Knowledge** and each isolated collection a
**Knowledge Space**. A newly signed-in member receives a preconfigured
**Common Brain**. We deliberately avoid “vault”: that word is reserved for a
future secrets and key-management boundary.

A Knowledge Space is a portable folder-shaped set of Markdown notes. Folder
paths provide human organization; explicit Markdown links, wikilinks,
frontmatter relations, and tags provide the durable graph. People and agents
edit the same documents. Each edit produces a full revision and a provenance
trace.

## Why this shape

The design follows three evidence-backed constraints:

1. Obsidian stores a knowledge base as normal files in a local folder and uses
   links, backlinks, properties, and graph views as complementary interfaces.
   Plain Markdown remains the interchange format instead of a proprietary
   document schema.
2. DeepSeek Harness separates capability contracts, providers, and consumers.
   Knowledge storage therefore sits behind `KnowledgeProvider`; the native
   cloud mirror and browser filesystem connector implement that seam while
   agent tools consume `BrainService` without depending on either provider.
3. Vector retrieval is strong for local semantic questions, while graph-aware
   retrieval adds connected context and supports broader relationship queries.
   The first release combines lexical ranking, semantic similarity, title
   matching, and bounded one-hop graph expansion. It does not invent an opaque
   LLM entity graph.
4. Google Cloud's Open Knowledge Format (OKF) v0.2 standardizes the portable
   layer we need: Markdown concepts with YAML frontmatter, normal Markdown
   links, bundle-relative paths, optional `index.md`/`log.md`, and first-class
   provenance, trust, freshness, lifecycle, and attested-computation metadata.
   Knowledge Spaces are permissive OKF consumers and produce conformant new
   notes without rejecting ordinary Markdown.
5. Karpathy's LLM Wiki is an operating pattern rather than a storage protocol:
   immutable raw sources, a persistent agent-maintained synthesis wiki, and an
   evolving instruction/schema document, exercised through ingest, query, and
   lint loops. Agent Commons supplies the shared files, retrieval, revision,
   graph, and provenance substrate; agent instructions and provider plugins own
   the domain-specific compilation workflow.

Primary references:

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [DeepSeek Harness capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- [Obsidian file storage](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata)
- [Obsidian internal links](https://obsidian.md/help/Linking%2Bnotes%2Band%2Bfiles/Internal%2Blinks)
- [Microsoft GraphRAG](https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/)
- [HybridRAG](https://arxiv.org/abs/2408.04948)
- [HippoRAG](https://arxiv.org/abs/2405.14831)
- [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)
- [Google Cloud's OKF announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
- [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

## Open format and workflow compatibility

The public API is consistently rooted at `/v1/knowledge`; the authenticated
Next.js proxy is rooted at `/api/knowledge`. “Brain” is product language only
and never appears in an API route.

Knowledge Space documents expose an `okf` analysis alongside their original
content and parsed frontmatter. The analysis identifies concept, index, and log
documents; reports v0.2 conformance issues; derives the advisory trust tier;
and surfaces lifecycle status, freshness, producers, verifiers, and source
count. Unknown frontmatter keys are preserved. A missing `type` or malformed
frontmatter makes a document non-conformant but never makes it unreadable.

OKF source, computation, executor, and attester paths participate in the same
inspectable graph as Markdown links. Agent Commons does not execute an OKF
attested computation merely because a document describes one. Execution and
deterministic receipt verification belong behind a separately authorized
capability provider; until that exists, the contract remains portable metadata.

The format and the maintenance workflow intentionally remain separate:

| Concern            | Open Knowledge Format                                    | Karpathy LLM Wiki                            | Agent Commons                                                                        |
| ------------------ | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Interchange        | Versioned Markdown/frontmatter bundle                    | Informal Markdown convention                 | Reads generic Markdown; creates and analyzes OKF v0.2                                |
| Knowledge identity | Bundle-relative concept path                             | Interlinked wiki page                        | Stable document ID plus portable path                                                |
| Provenance/trust   | `sources`, `generated`, `verified`, freshness and status | Human review and source summaries            | Preserves OKF fields and attaches every retrieval/edit to provenance traces          |
| Maintenance        | Deliberately does not prescribe a runtime                | Ingest, query, lint                          | Agent tools plus replaceable providers; workflow instructions remain domain-specific |
| Retrieval          | Deliberately unspecified                                 | Index first, search as scale grows           | Heading chunks, lexical/vector ranking, and bounded graph expansion                  |
| Collaboration      | Git/directory distribution                               | Primarily one human and one maintainer agent | Revision-safe multi-agent grants, browser folders, and future workspace subjects     |

## Capability seam

```text
REST / SDK / browser / static agent tools (`/v1/knowledge`)
                  │
              BrainService
       ┌──────────┼───────────┐
 authorization   indexing   provenance
       │            │           │
       └──── KnowledgeProvider ──┘
                    │
        ┌───────────┴────────────┐
        native        browser_filesystem
```

The provider owns canonical document writes and removals. `BrainService` owns
stable platform behavior: grants, revisions, graph rebuilding, chunks,
embeddings, retrieval, and provenance. Adding a Git, S3, Drive, Notion, or
enterprise connector should require another provider registration—not changes
to agent tools.

The browser filesystem provider uses a cloud Markdown mirror because browser
directory handles are device-local and revocable. While the folder is
connected, human edits are written to both locations and folder sync updates
the mirror. Agents continue to work against the authorized mirror when the
member's device is offline. Sync retains an unchanged local file when the cloud
copy has a newer agent edit and reports a conflict when both changed. The UI
communicates reconnection explicitly and requires it before deleting a local
source note.

## Data and graph model

- `knowledge_space`: ownership, provider, state, and connector configuration.
- `knowledge_space_grant`: explicit user, agent, or workspace subject with
  read/write/manage permission and automatic-retrieval policy.
- `knowledge_folder`: durable empty and populated folders with portable,
  case-insensitive paths.
- `knowledge_document`: mutable canonical Markdown at a case-insensitive path.
- `knowledge_document_revision`: immutable full snapshots tied to an actor and
  provenance trace.
- `knowledge_link`: inspectable resolved or unresolved wikilink, Markdown link,
  or frontmatter relationship.
- `knowledge_chunk`: heading-aware citeable retrieval unit with optional
  1,536-dimensional embedding.

Document paths remain the portable source of hierarchy; explicit folder rows
also preserve empty folders and make rename, move, and recursive delete
revision-safe. Exports need no proprietary folder format. Explicit links are
preserved even when their target does not exist yet; graph rebuilding resolves
them if the target later appears. Document aliases include full path, path
without extension, basename, title, and frontmatter aliases.

## Retrieval

The current online scorer is:

```text
with embeddings: 0.68 × semantic + 0.22 × lexical + 0.15 title boost
without embeddings: 0.85 × lexical + 0.15 title boost
connected neighbor: up to 0.35 × seed score
```

Markdown is chunked on headings at roughly 2,200 characters with a small
overlap. Search first ranks matching chunks, keeps the best chunk per document,
then expands only one graph hop from the strongest seeds. This bounds latency
and prevents graph fan-out from overwhelming direct evidence. Results expose
their matching modes and content hashes; agent-run retrieval is attached to the
active provenance trace as `knowledge_retrieval` lineage.

Embeddings use `BRAIN_EMBEDDING_MODEL`, then
`ARTIFACT_EMBEDDING_MODEL`, then `text-embedding-3-small`. If no OpenAI key is
available—or `BRAIN_EMBEDDINGS_DISABLED=true`—the same APIs remain functional
with lexical, title, and graph ranking.

## Agent behavior and authorization

All Commons agents receive four static tools:

- list accessible Knowledge Spaces;
- hybrid search;
- read a full note with links and backlinks;
- create or revision-safely update a note.

The default Common Brain is seeded with a welcome guide, inbox, decision
memory, and reusable note template, then granted to all of the member's agents.
Other spaces can be dedicated to selected agents, shared among several, or
configured to grant current and future owned agents. Each grant independently
chooses automatic retrieval or manual-only access. When an agent searches
without explicit space IDs, only its automatic routes participate; naming a
space opts into an explicit manual route. The agent identity—not a caller-
supplied owner—is checked at the service boundary. Optimistic revision checks
prevent a person and agent from silently overwriting one another.

The schema already supports user and workspace grants so team permissions can
be added without migrating the core model. The first release intentionally
ships only personal and agent management: it does not expose unfinished
enterprise membership policy.

## UI contract

`/knowledge` lives in the standard Commons dashboard shell; the legacy
`/brains` page redirects there. It uses warm stone surfaces, teal accents, the
existing type scale, controls, dialogs, and spacing. The interface has three
calm work areas: a drag-and-drop folder tree, visual editor or graph, and an
inspector for backlinks, tags, and revision details. Folders and notes support
inline rename, move, and delete. The visual editor is the default and includes
tables, links, images, files, and Library insertion; raw Markdown remains a
first-class mode. The custom canvas graph uses a dark, pannable force layout,
click-to-focus neighborhood highlighting, and double-click-to-open behavior.

## Operational checks

1. Apply migrations 027 and 028 before deploying the API.
2. Keep embeddings optional during rollout; validate lexical retrieval first.
3. Create a space, import linked Markdown, and verify resolved/unresolved graph
   edges.
4. Grant one agent read and another write access; verify denied mutations.
5. Race two updates at the same revision and require one 409 conflict.
6. Run an agent search/edit and verify `knowledge.retrieval` and document
   mutation events in the Knowledge Space provenance scope.
7. Exercise reconnect/sync in a Chromium browser and confirm agent retrieval
   still works after the directory handle is released.
