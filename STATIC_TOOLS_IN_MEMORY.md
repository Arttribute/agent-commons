# Static Tools - In-Memory Architecture

## Overview

Static tools are now kept **ONLY in memory**, not stored in the database. This provides a cleaner separation between platform tools and user-created tools.

## Architecture Changes

### 1. Removed Database Sync ✅

**File:** [tool.module.ts](apps/commons-api/src/tool/tool.module.ts)

**Before:**
```typescript
export class ToolModule implements OnModuleInit {
  async onModuleInit() {
    await this.toolService.syncStaticToolsToDatabase();
  }
}
```

**After:**
```typescript
export class ToolModule {
  // Static tools are kept in memory only, not synced to database
}
```

**Result:**
- No longer syncs static tools to database on startup
- Static tools remain in-memory only
- Database only contains user-created custom tools

### 2. Updated Workflow Executor ✅

**File:** [workflow-executor.service.ts](apps/commons-api/src/tool/workflow-executor.service.ts)

Added fallback to check static tools when not found in database:

```typescript
// Try to get tool from database first (for custom tools)
let tool: any = await this.db.query.tool.findFirst({
  where: (t: any) => eq(t.toolId, context.toolId),
});

// If not in database, check static tools (in-memory)
if (!tool) {
  const staticTools = this.toolService.getStaticTools();
  const staticTool = staticTools.find((t) => t.toolId === context.toolId);
  if (staticTool) {
    // Convert static tool format to match expected tool format
    tool = {
      ...staticTool,
      owner: null,
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ['platform', 'static'],
    };
  }
}
```

**Result:**
- Workflows can reference both database tools (custom) and static tools (in-memory)
- Static tools looked up on-demand during execution
- No performance penalty (static tools generated once at startup via singleton service)

### 3. Fixed Tool Filtering ✅

**File:** [tool.service.ts](apps/commons-api/src/tool/tool.service.ts#L76-L109)

Improved filtering to properly separate platform and user tools:

```typescript
async getAllTools(filters?: {
  owner?: string;
  ownerType?: 'user' | 'agent' | 'platform';
  visibility?: 'public' | 'private' | 'platform';
}) {
  const conditions = [];

  // Filter by ownerType first (most important for separating platform from user tools)
  if (filters.ownerType) {
    conditions.push(eq(schema.tool.ownerType, filters.ownerType));
  }

  // Then filter by specific owner if provided
  if (filters.owner) {
    conditions.push(eq(schema.tool.owner, filters.owner));
  }

  return this.db.query.tool.findMany({
    where: and(...conditions),
  });
}
```

**Result:**
- User tools query (`ownerType='user'`) only returns user tools from database
- Platform tools query (`/api/tools/static`) returns in-memory static tools
- No mixing between the two

### 4. Fixed UNDEFINED_VALUE Errors ✅

**File:** [workflow-executor.service.ts](apps/commons-api/src/tool/workflow-executor.service.ts)

Added JSON serialization to all database updates:

```typescript
// Update execution with node results
await this.db
  .update(schema.workflowExecution)
  .set({ nodeResults: JSON.parse(JSON.stringify(nodeResults)) })
  .where(eq(schema.workflowExecution.executionId, executionId));

// Mark execution as completed
await this.db
  .update(schema.workflowExecution)
  .set({
    status: 'completed',
    completedAt: new Date(),
    ...(finalOutput !== undefined && { outputData: JSON.parse(JSON.stringify(finalOutput)) }),
    nodeResults: JSON.parse(JSON.stringify(nodeResults)),
    currentNode: null,
  })
  .where(eq(schema.workflowExecution.executionId, executionId));
```

**Result:**
- All undefined values filtered out before database operations
- No more UNDEFINED_VALUE errors from Drizzle ORM

## How It Works

### Static Tool Flow:

1. **Frontend Fetches Static Tools**
   ```
   GET /api/tools/static
   → Returns in-memory tools with deterministic UUIDs
   ```

2. **User Creates Workflow**
   ```
   - Drags static tool (e.g., "findResources") to canvas
   - Workflow stores toolId (deterministic UUID)
   - Workflow saved to database with node.toolId reference
   ```

3. **Workflow Execution**
   ```
   - Workflow executor receives toolId
   - Checks database for tool (custom tools)
   - If not found, checks static tools (in-memory)
   - Executes tool with inputs
   ```

### Deterministic UUIDs:

Static tools use SHA-1 hashing to generate consistent UUIDs:

```typescript
generateStaticToolId("findResources")
  → Always returns: "cb80d398-d993-5d44-814b-fd4ff2bb8a20"

generateStaticToolId("transferTokensToWallet")
  → Always returns: "48927bc9-5aee-59c8-a1d1-cbaddf29037b"
```

This ensures workflows can reliably reference static tools across server restarts.

## Benefits of In-Memory Approach

### ✅ Advantages:

1. **Clean Separation**
   - Database = User-created tools only
   - Memory = Platform/static tools only
   - No mixing or confusion

2. **No Database Bloat**
   - Database doesn't store system tools
   - Easier to backup/restore user data
   - Clearer data ownership

3. **Always Up-to-Date**
   - Static tools updated with code deployments
   - No migration needed for tool schema changes
   - Single source of truth (TypeScript interfaces)

4. **Performance**
   - Static tools generated once at startup
   - No database queries for platform tools
   - Faster tool lookup during execution

### ⚠️ Considerations:

1. **Tool Resolution**
   - Workflow executor checks two sources (DB + memory)
   - Slightly more complex lookup logic
   - **Mitigation:** Lookup is O(1) for DB, O(n) for static tools (small n)

2. **API Complexity**
   - Two endpoints: `/api/tools` (DB) and `/api/tools/static` (memory)
   - Frontend must call both to get all tools
   - **Mitigation:** Frontend already handles this correctly

## Database State

### What's in the Database:

| Table | Contains |
|-------|----------|
| `tool` | User-created custom tools only |
| `workflow` | All workflows (using both static and custom tools) |
| `workflow_execution` | Execution results |

### What's NOT in the Database:

- Static/platform tools (findResources, transferTokensToWallet, etc.)
- Static tool schemas
- Static tool metadata

## Frontend Impact

### Tool Sidebar:

```typescript
// Fetches both user tools and static tools
const [userTools, staticTools] = await Promise.all([
  fetch(`/api/tools?owner=${userId}&ownerType=user`),  // DB query
  fetch(`/api/tools/static`),                           // In-memory
]);
```

### Display:

- **Common Tools (Purple):** Static tools from memory
- **Your Tools (Blue):** Custom tools from database

### Workflow Loading:

```typescript
// When loading saved workflow:
1. Fetch workflow definition from DB
2. For each tool node:
   a. Try to find tool in user tools (DB)
   b. Try to find tool in static tools (memory)
   c. Re-extract inputs/outputs from schema
```

## Testing

### Test Workflow Execution:

1. **Restart backend:**
   ```bash
   cd apps/commons-api
   npm run start:dev
   ```

2. **Create workflow with static tool:**
   - Drag "Find Resource" to canvas
   - Configure inputs
   - Save workflow

3. **Execute workflow:**
   - Should find tool from in-memory static tools
   - Should execute successfully
   - Should return results

4. **Verify database:**
   ```sql
   SELECT * FROM tool WHERE name = 'findResources';
   -- Should return 0 rows (not in DB)
   ```

### Test Tool Separation:

1. **Check "Common Tools" section:**
   - Should show all static tools
   - Purple borders
   - "platform" badge

2. **Check "Your Tools" section:**
   - Should show only custom tools
   - Blue borders
   - No static tools

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Static tools location | Database | In-memory only |
| Database size | Larger (includes static tools) | Smaller (user tools only) |
| Tool updates | Requires migration | Automatic with code deploy |
| Separation | Mixed | Clear (DB vs memory) |
| Performance | Database query for all | DB for custom, memory for static |
| Complexity | Simple (one source) | Moderate (two sources) |

**Overall:** The in-memory approach provides better separation, cleaner data model, and easier maintenance at the cost of slightly more complex tool resolution logic.
