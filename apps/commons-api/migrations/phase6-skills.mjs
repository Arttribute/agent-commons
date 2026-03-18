/**
 * Phase 6: Skills System
 *
 * Creates the `skill` table for the modular capability / SKILL.md system.
 * Seeds 5 built-in platform skills.
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? 'agentcommons',
  username: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
});

async function tableExists(table) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sql`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return rows.length > 0;
}

async function rowExists(table, column, value) {
  const rows = await sql`
    SELECT 1 FROM ${sql(table)} WHERE ${sql(column)} = ${value}
  `;
  return rows.length > 0;
}

// ── Built-in platform skills ───────────────────────────────────────────────

const PLATFORM_SKILLS = [
  {
    skillId: 'skill-web-research',
    slug: 'web-research',
    name: 'Web Research',
    description: 'Search the web, fetch URLs, and extract structured information from online sources.',
    instructions: `## Web Research Skill

When tasked with researching a topic:

1. **Decompose the query** — break the research question into 2-3 specific sub-questions before searching.
2. **Search strategically** — use targeted, specific search queries rather than broad terms. Try multiple angles.
3. **Fetch primary sources** — when a search result looks relevant, fetch the full URL to read the actual content.
4. **Verify across sources** — cross-reference key facts across at least 2 independent sources before reporting.
5. **Extract key facts** — identify and clearly state the most relevant facts, dates, statistics, and figures.
6. **Cite your sources** — always include URLs or source names for every claim you make.
7. **Synthesize** — combine findings into a coherent, structured summary with clear sections.

**Output format:**
- Lead with a 2-3 sentence executive summary
- Follow with detailed findings organized by sub-question
- End with a "Sources" section listing all URLs referenced

Available tools: web_search, fetch_url`,
    tools: ['web_search', 'fetch_url'],
    triggers: ['search for', 'research', 'find information about', 'look up', 'browse to', 'what is', 'who is'],
    tags: ['research', 'web', 'search'],
    icon: '🔍',
  },
  {
    skillId: 'skill-data-analysis',
    slug: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze datasets, compute statistics, identify patterns, and generate actionable insights.',
    instructions: `## Data Analysis Skill

When analyzing data:

1. **Understand the data first** — inspect structure, field names, data types, and any missing/null values before analysis.
2. **Compute descriptive statistics** — mean, median, standard deviation, min, max, and quartiles for numeric fields.
3. **Identify distributions** — describe whether data is normally distributed, skewed, or bimodal.
4. **Find patterns and trends** — look for time trends, correlations between fields, clusters, and outliers.
5. **Highlight outliers** — identify data points that are more than 2 standard deviations from the mean and note them.
6. **Assess data quality** — note missing values, duplicates, inconsistent formats, or suspicious entries.
7. **Draw conclusions** — state clearly what the data tells you, with specific numbers to support each conclusion.
8. **Recommend actions** — suggest concrete next steps based on what the data shows.

**Output format:**
- Dataset overview (rows, columns, data types)
- Key statistics table
- Notable patterns and trends
- Outliers and anomalies
- Conclusions and recommendations

Present results with specific numbers and percentages, not vague descriptions.`,
    tools: [],
    triggers: ['analyze', 'data analysis', 'statistics', 'insights from', 'patterns in', 'summarize this data'],
    tags: ['analytics', 'data', 'statistics'],
    icon: '📊',
  },
  {
    skillId: 'skill-code-review',
    slug: 'code-review',
    name: 'Code Review',
    description: 'Review code for correctness, security vulnerabilities, performance issues, and best practices.',
    instructions: `## Code Review Skill

When reviewing code, systematically check each of these dimensions:

1. **Correctness** — does the code do what it's supposed to do? Trace through the logic for edge cases (empty input, null values, boundary conditions).
2. **Security** — check for:
   - SQL/command injection vulnerabilities
   - Improper input validation or sanitization
   - Exposed secrets or API keys in code
   - Insecure dependencies (check versions)
   - Missing authentication/authorization checks
   - XSS vulnerabilities in frontend code
3. **Performance** — identify:
   - O(n²) or worse algorithms where O(n) or O(n log n) is possible
   - N+1 database query patterns
   - Unnecessary re-computation inside loops
   - Missing database indexes for queried fields
   - Memory leaks (unclosed connections, growing collections)
4. **Readability** — assess naming clarity, function length (>50 lines is a smell), comment quality for complex logic.
5. **Error handling** — are errors caught and handled? Are error messages helpful? Are failures logged?
6. **Testability** — can this code be unit tested? Are dependencies injectable/mockable?

**Output format for each issue:**
- **Severity**: Critical / Major / Minor
- **Location**: file:line or function name
- **Issue**: what the problem is
- **Fix**: specific recommended change with example code if helpful

End with an overall assessment and list of the top 3 most important changes.`,
    tools: [],
    triggers: ['review this code', 'code review', 'check for bugs', 'security review', 'audit this', 'find issues in'],
    tags: ['code', 'security', 'review', 'quality'],
    icon: '🔎',
  },
  {
    skillId: 'skill-blockchain-ops',
    slug: 'blockchain-ops',
    name: 'Blockchain Operations',
    description: 'Interact with blockchain networks — read balances, query transactions, and execute on-chain operations safely.',
    instructions: `## Blockchain Operations Skill

When performing blockchain operations, follow these safety rules strictly:

**Before any transaction:**
1. **Verify the address** — double-check wallet addresses character by character. Blockchain transactions are irreversible.
2. **Check balances** — confirm the account has sufficient funds including gas fees before any transaction.
3. **Estimate gas** — always estimate gas costs first; warn the user if costs seem unusually high (>0.01 ETH).
4. **Confirm the network** — verify whether the operation is on mainnet, Base Sepolia testnet, or another chain. Default to testnet unless explicitly told otherwise.

**For read operations:**
5. **Prefer view functions** — when the goal is information, use read-only calls (view/pure functions) instead of state-changing transactions.
6. **Cache results** — if you've already read a value in this session, use the cached result rather than making duplicate calls.

**For write operations:**
7. **Explain what will happen** — before executing a transaction, clearly describe what it will do and what the cost is.
8. **Report transaction hashes** — always return the transaction hash so the user can verify on a block explorer (basescan.org for Base).
9. **Wait for confirmation** — wait for at least 1 block confirmation before reporting success.

**Error handling:**
10. **Insufficient funds** — clearly state how much is needed vs how much is available.
11. **Failed transactions** — decode revert reasons when possible and explain in plain language.

Available tools: check_wallet_balance (via agent wallet), web_search for block explorer lookups.`,
    tools: ['check_wallet_balance'],
    triggers: ['blockchain', 'on-chain', 'wallet balance', 'transaction', 'smart contract', 'token', 'NFT', 'crypto'],
    tags: ['blockchain', 'web3', 'ethereum', 'defi'],
    icon: '⛓️',
  },
  {
    skillId: 'skill-file-ops',
    slug: 'file-ops',
    name: 'File Operations',
    description: 'Read, write, search, and organize files using available MCP filesystem tools.',
    instructions: `## File Operations Skill

When working with files:

1. **Read before modify** — always read a file's current contents before making any changes to it.
2. **Validate paths first** — check that file paths exist and are accessible before attempting operations on them.
3. **Preserve originals** — when modifying a file, note what the original content was so changes can be undone.
4. **Atomic changes** — make the minimal necessary change. Don't reformat or restructure code/text you weren't asked to touch.
5. **Use structured formats** — prefer JSON/YAML for config files, Markdown for documentation, CSV for tabular data.
6. **Handle errors clearly** — if a file operation fails (permission denied, not found, disk full), explain the exact error and suggest a resolution.
7. **Summarize changes** — after any file write or modification, summarize exactly what changed (lines added/removed, sections modified).
8. **Large files** — for files over 1MB, read in chunks if possible rather than loading the entire file.

**Directory operations:**
- When listing directory contents, show file sizes and modification dates when available
- When searching, prefer targeted searches (grep by content or glob by name) over listing everything

**Safety:**
- Never delete files without explicit user confirmation
- Always create a backup note before overwriting important files

Use MCP filesystem tools if available (list_directory, read_file, write_file, search_files).`,
    tools: [],
    triggers: ['read file', 'write file', 'create file', 'list files', 'find file', 'search files', 'file system', 'directory'],
    tags: ['files', 'filesystem', 'io'],
    icon: '📁',
  },
];

async function run() {
  console.log('Phase 6: Skills System migration\n');

  try {
    // ── Create skill table ─────────────────────────────────────────────────
    if (!(await tableExists('skill'))) {
      await sql`
        CREATE TABLE skill (
          skill_id    text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
          slug        text NOT NULL UNIQUE,
          name        text NOT NULL,
          description text NOT NULL,
          instructions text NOT NULL,

          tools       jsonb NOT NULL DEFAULT '[]'::jsonb,
          triggers    jsonb NOT NULL DEFAULT '[]'::jsonb,

          owner_id    text,
          owner_type  text NOT NULL DEFAULT 'platform',

          is_public   boolean NOT NULL DEFAULT true,
          is_active   boolean NOT NULL DEFAULT true,

          version     text NOT NULL DEFAULT '1.0.0',
          tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
          icon        text,
          usage_count integer NOT NULL DEFAULT 0,

          source      text NOT NULL DEFAULT 'platform',
          source_url  text,

          created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
          updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
        )
      `;
      console.log('  + table skill created');
    } else {
      console.log('  · table skill already exists');
    }

    // ── Indexes ────────────────────────────────────────────────────────────
    if (!(await indexExists('idx_skill_slug'))) {
      await sql`CREATE UNIQUE INDEX idx_skill_slug ON skill (slug)`;
      console.log('  + idx_skill_slug');
    }
    if (!(await indexExists('idx_skill_owner'))) {
      await sql`CREATE INDEX idx_skill_owner ON skill (owner_id, owner_type)`;
      console.log('  + idx_skill_owner');
    }
    if (!(await indexExists('idx_skill_public_active'))) {
      await sql`CREATE INDEX idx_skill_public_active ON skill (is_public, is_active)`;
      console.log('  + idx_skill_public_active');
    }

    // ── Seed platform skills ───────────────────────────────────────────────
    console.log('\n  Seeding built-in platform skills…');
    for (const skill of PLATFORM_SKILLS) {
      if (await rowExists('skill', 'skill_id', skill.skillId)) {
        console.log(`  · skill "${skill.slug}" already seeded`);
        continue;
      }
      await sql`
        INSERT INTO skill (
          skill_id, slug, name, description, instructions,
          tools, triggers, owner_id, owner_type,
          is_public, is_active, version, tags, icon, source
        ) VALUES (
          ${skill.skillId}, ${skill.slug}, ${skill.name}, ${skill.description}, ${skill.instructions},
          ${JSON.stringify(skill.tools)}, ${JSON.stringify(skill.triggers)},
          NULL, 'platform',
          true, true, '1.0.0', ${JSON.stringify(skill.tags)}, ${skill.icon}, 'platform'
        )
      `;
      console.log(`  + skill "${skill.slug}" seeded`);
    }

    console.log('\nPhase 6 migration complete ✓');
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
