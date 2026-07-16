# Artifact library

The artifact library is the durable, permissioned home for user uploads and
files produced by agents in ordinary chat sessions. Files inside an agent's
computer are a separate security and lifecycle domain and are never indexed or
copied into the library automatically.

## Storage and provenance

- `library_item` owns metadata, tenant ownership, provenance, status, and soft deletion.
- `library_blob` points at an original or derived object. Private S3 is the default;
  IPFS is an explicit per-account or per-upload opt-in.
- `library_link` groups an item with its source chat or Next.js code project. A
  provenance link is not an access grant.
- `library_chunk` contains bounded, citeable text chunks and 1,536-dimensional
  embeddings for hybrid retrieval.
- `library_grant` grants a user, agent, or workspace read/edit/manage access.
- `library_share_link` stores only a SHA-256 token hash and may expire or be revoked.
- `library_audit_event` records security-sensitive actions.

## Authorization invariant

Every list, metadata, content, download, preview, and search query applies an
ownership/workspace/grant predicate before returning data. Unauthorized lookups
return not-found responses to avoid confirming an artifact exists. Agent search
only includes artifacts linked to that agent's active session or explicitly
granted to that agent. Search results never widen authorization.

S3 objects use non-enumerable tenant-hashed prefixes, server-side encryption,
blocked direct access, and short-lived signed URLs. Potentially active content
is downloaded as an attachment. Public share tokens are high entropy, hashed at
rest, rate-limited, auditable, expirable, and revocable.

IPFS content is publicly addressable and may remain available after a library
item is deleted. The UI warns about this property before opt-in. Generated
images, chat files, and documents otherwise use S3.

## Retrieval

Text extraction is type-aware (PDF, Office documents, spreadsheets, CSV, text)
and capped before chunking. Retrieval combines PostgreSQL full-text ranking with
pgvector cosine similarity and always joins through the authorized item set.
Embedding failures degrade to lexical search rather than blocking upload.

The design follows the scoped-knowledge and persistent-library patterns
documented by Anthropic and OpenAI, pgvector's HNSW/hybrid-search guidance, and
AWS's private-bucket and presigned-URL guidance:

- https://help.openai.com/en/articles/20001052-library-for-chatgpt
- https://support.anthropic.com/en/articles/9517075-what-are-projects
- https://github.com/pgvector/pgvector
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
