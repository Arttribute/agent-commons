# Memory

Memory gives agents a persistent store of knowledge that survives across sessions. Instead of starting fresh each time, agents can remember facts about users, past events, and learned procedures.

---

## Memory types

| Type | What it stores | Example |
|---|---|---|
| `semantic` | Facts and knowledge | "User prefers metric units" |
| `episodic` | Records of past events | "On Apr 5, user asked about Q1 results" |
| `procedural` | How to do things | "To generate a report: 1. fetch data 2. aggregate 3. format" |

---

## Storing a memory

```bash
curl -X POST https://api.agentcommons.io/v1/memory \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "agentId": "agent_abc123",
    "memoryType": "semantic",
    "content": "The user'\''s name is Alex and they work in product management.",
    "tags": ["user_info", "preferences"],
    "importanceScore": 0.8
  }'
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `agentId` | yes | Which agent this memory belongs to |
| `memoryType` | yes | `semantic`, `episodic`, or `procedural` |
| `content` | yes | The memory text |
| `summary` | no | A shorter version for display |
| `tags` | no | Labels for filtering |
| `importanceScore` | no | 0.0–1.0, used for pruning low-importance memories |
| `sourceType` | no | Where this came from: `conversation`, `task`, `manual` |

---

## Retrieving memories by semantic search

Find memories relevant to a query using vector similarity:

```bash
curl "https://api.agentcommons.io/v1/memory/agents/agent_abc123/retrieve?q=user+preferences+formatting" \
  -H "x-api-key: YOUR_KEY"
```

**Response:**
```json
{
  "memories": [
    {
      "memoryId": "mem_abc",
      "content": "User prefers bullet-point responses over paragraphs.",
      "score": 0.93,
      "memoryType": "semantic",
      "tags": ["preferences", "formatting"]
    },
    {
      "memoryId": "mem_def",
      "content": "User asked to avoid markdown tables in responses.",
      "score": 0.71,
      "memoryType": "semantic",
      "tags": ["preferences"]
    }
  ]
}
```

`score` is the semantic similarity (0–1). Higher = more relevant.

---

## List all memories for an agent

```bash
curl "https://api.agentcommons.io/v1/memory/agents/agent_abc123" \
  -H "x-api-key: YOUR_KEY"
```

Filter by type:

```bash
curl "https://api.agentcommons.io/v1/memory/agents/agent_abc123?type=episodic" \
  -H "x-api-key: YOUR_KEY"
```

---

## Get memory statistics

```bash
curl "https://api.agentcommons.io/v1/memory/agents/agent_abc123/stats" \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "total": 42,
  "byType": {
    "semantic": 28,
    "episodic": 10,
    "procedural": 4
  },
  "averageImportanceScore": 0.65
}
```

---

## Update a memory

```bash
curl -X PATCH https://api.agentcommons.io/v1/memory/mem_abc \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "content": "User prefers numbered lists over bullet points.",
    "importanceScore": 0.9
  }'
```

---

## Delete a memory

```bash
curl -X DELETE https://api.agentcommons.io/v1/memory/mem_abc \
  -H "x-api-key: YOUR_KEY"
```

---

## Using memory in an agent workflow

The typical pattern is:

1. Before running, retrieve relevant memories and inject them into the system prompt
2. After running, extract new facts from the conversation and store them as memories

### Example with SDK

```typescript
async function runWithMemory(agentId: string, userMessage: string) {
  // 1. Find relevant memories
  const memories = await client.memory.retrieve(agentId, {
    query: userMessage,
    limit: 5,
  });

  // 2. Build a context-enriched system message
  const memoryContext = memories
    .map(m => `- ${m.content}`)
    .join('\n');

  // 3. Run the agent with memory context injected
  const result = await client.agents.run({
    agentId,
    messages: [
      {
        role: 'system',
        content: `Known facts about this user:\n${memoryContext}`,
      },
      { role: 'user', content: userMessage },
    ],
  });

  // 4. Optionally, store any new facts learned
  if (result.newFacts) {
    for (const fact of result.newFacts) {
      await client.memory.create({
        agentId,
        memoryType: 'semantic',
        content: fact,
        sourceType: 'conversation',
      });
    }
  }

  return result;
}
```

---

## Semantic search (embeddings)

Memories are stored as vector embeddings (via Supabase), enabling fast semantic search. When you call `retrieve?q=...`, the query is embedded and matched against all stored memory embeddings by cosine similarity.

You can also use the embedding API directly:

### Store an embedding

```bash
curl -X POST https://api.agentcommons.io/v1/embedding \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "text": "Quantum computing uses qubits to perform calculations",
    "metadata": { "source": "article", "topic": "quantum" }
  }'
```

### Search embeddings

```bash
curl -X POST https://api.agentcommons.io/v1/embedding/find \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "query": "how do quantum computers work",
    "limit": 5
  }'
```

---

## CLI

```bash
# List memories
agc memory list --agent agent_abc123

# Add a memory
agc memory add \
  --agent agent_abc123 \
  --type semantic \
  --content "User works in the healthcare industry"

# Search memories
agc memory search \
  --agent agent_abc123 \
  --query "user industry background"

# Delete a memory
agc memory delete mem_abc
```
