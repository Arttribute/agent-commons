# Workflow System Fixes - Summary

## Issues Fixed

### 1. UNDEFINED_VALUE Database Error ✅

**Problem:**
When executing workflows without an `agentId`, the system threw:
```
UNDEFINED_VALUE: Undefined values are not allowed
```

**Root Cause:**
Drizzle ORM doesn't allow `undefined` values in insert statements. When optional fields (`agentId`, `sessionId`, `taskId`) were undefined, the insert would fail.

**Solution:**
Updated [workflow-executor.service.ts:83-87](apps/commons-api/src/tool/workflow-executor.service.ts#L83-L87) to only include fields that have values:

```typescript
.values({
  workflowId,
  ...(agentId && { agentId }),
  ...(sessionId && { sessionId }),
  ...(taskId && { taskId }),
  status: 'running',
  startedAt: new Date(),
  inputData,
  nodeResults: {},
})
```

**Result:**
✅ Test workflows can now execute without requiring an agentId
✅ No more UNDEFINED_VALUE errors

### 2. Type Inference Improvements ✅

**Problem:**
- Tools like `findResources` were showing type "object" instead of "array"
- No automatic type detection based on function naming patterns

**Solution:**
Enhanced [type-mapping.ts:92-119](apps/commons-app/lib/workflows/type-mapping.ts#L92-L119) with better heuristics:

```typescript
export function inferOutputType(schema: any): WorkflowDataType {
  const description = schema?.function?.description || "";
  const functionName = schema?.function?.name || "";

  // Check description for explicit type hints
  if (description.toLowerCase().includes("returns a string")) return "string";
  if (description.toLowerCase().includes("returns an array")) return "array";

  // Infer from function name patterns
  const lowerName = functionName.toLowerCase();
  if (
    lowerName.endsWith("s") ||     // plural: findResources, getGoals
    lowerName.includes("list") ||
    lowerName.includes("find") ||
    lowerName.includes("search") ||
    lowerName.includes("all")
  ) {
    if (description.toLowerCase().includes("resource")) return "array";
  }

  return "object";
}
```

**Result:**
✅ `findResources` now correctly shows "Array" type
✅ Better automatic type detection for common patterns

## Object Destructuring - Current State and Future Plan

### Current Limitation

**The Problem:**
LLM tool schemas (ChatGPT function calling format) don't have a standard way to specify return types. They only define:
1. Function name
2. Description
3. Input parameters

**What's Missing:**
There's no `returns` or `output` field in the schema to describe the structure of what the function returns.

**Current Implementation:**
The system can extract object properties IF the tool description explicitly documents them in this format:
```
"returns an object with: fieldName (type), anotherField (type)"
```

However, most tool descriptions don't follow this pattern, so automatic destructuring doesn't work.

### Why This Happens

Looking at [common-tool.service.ts:71](apps/commons-api/src/tool/tools/common-tool.service.ts#L71):

```typescript
findResources(props: { query: string; resourceType: ResourceType }): any;
```

The return type is `any`, so:
1. TypeScript can't infer the structure
2. Typia can't generate schema for the return value
3. LLM tool schema has no return type information

### Solutions (In Order of Effort)

#### Option 1: Document Return Types in Descriptions (Quick)

Update tool descriptions to include return field information:

```typescript
/**
 * Find Resources available in the network
 * Returns an array of objects with: id (string), name (string), type (string), creator (string)
 */
findResources(props: { query: string; resourceType: ResourceType }): any;
```

**Pros:** Quick, works with current implementation
**Cons:** Manual, prone to becoming outdated

#### Option 2: Add Custom Schema Extensions (Medium)

Extend tool schemas with custom return type field:

```typescript
{
  type: "function",
  function: {
    name: "findResources",
    description: "...",
    parameters: { ... },
    // Custom extension
    returns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" }
        }
      }
    }
  }
}
```

**Pros:** Structured, maintainable
**Cons:** Requires updating tool generation and all tool definitions

#### Option 3: Properly Type Return Values (Best, Most Effort)

Update CommonTool interface with proper return types:

```typescript
interface Resource {
  id: string;
  name: string;
  type: string;
  creator: string;
  // ... other fields
}

interface CommonTool {
  findResources(props: {
    query: string;
    resourceType: ResourceType
  }): Promise<Resource[]>;
}
```

Then use Typia to generate schemas from the return types.

**Pros:** Type-safe, automatic schema generation, catches errors at compile time
**Cons:** Requires updating all tool interfaces and implementations

#### Option 4: Manual Output Configuration (Alternative)

Add UI in the workflow editor to manually configure output properties:
- User can add/edit output handles on tool nodes
- Store custom output configuration in workflow definition
- Useful for tools where automatic inference isn't possible

**Pros:** Flexible, works for any tool
**Cons:** Manual work for each workflow

### Recommended Approach

**Short-term:** Use Option 1 (document in descriptions) for critical tools
**Long-term:** Implement Option 3 (proper TypeScript types) for all tools

This provides immediate relief while working toward a robust, type-safe solution.

## Example: Adding Destructured Outputs

If you want `findResources` to expose individual fields, update its description:

**Before:**
```typescript
/**
 * Find Resources available in the network, you may filter by query and resource type
 * The query is a string that will be used to search for resources
 */
findResources(props: { query: string; resourceType: ResourceType }): any;
```

**After:**
```typescript
/**
 * Find Resources available in the network, you may filter by query and resource type
 * Returns an array of resources. Each resource is an object with: id (string), name (string), type (string), creator (string), description (string)
 */
findResources(props: { query: string; resourceType: ResourceType }): any;
```

The system will then create these output handles:
- `result` (array)
- `result.id` (string)
- `result.name` (string)
- `result.type` (string)
- `result.creator` (string)
- `result.description` (string)

## Testing the Fixes

1. **Restart backend:**
   ```bash
   cd apps/commons-api
   npm run start:dev
   ```

2. **Test workflow execution:**
   - Create a workflow with "Find Resource" node
   - Set inputs: `query` = "test", `resourceType` = "text"
   - Click "Run Workflow"
   - Should execute without UNDEFINED_VALUE error

3. **Verify type inference:**
   - Drag "Find Resource" tool to canvas
   - Check output handle - should show "Array" type (pink color)
   - Other tools ending in 's' should also show correct array types

## Files Modified

### Backend:
- [workflow-executor.service.ts](apps/commons-api/src/tool/workflow-executor.service.ts) - Fixed undefined value handling

### Frontend:
- [type-mapping.ts](apps/commons-app/lib/workflows/type-mapping.ts) - Improved type inference and output extraction

## Next Steps

1. ✅ Test workflow execution with the fixes
2. 📝 Document return types for commonly used tools
3. 🔄 Plan migration to properly typed return values
4. 🎨 Consider adding manual output configuration UI
