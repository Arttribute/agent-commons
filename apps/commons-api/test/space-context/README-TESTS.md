# Shared Session Context Tests

This directory contains comprehensive tests to verify that the refactored agent system uses shared session contexts instead of recursive child sessions.

## Test Files

### 1. `session-context.test.ts`

- **Purpose**: Full integration tests covering the entire shared context system
- **Coverage**: AgentService, SpaceConductor, CommonToolService, and their interactions
- **Key Tests**:
  - Session context management
  - Event bus functionality
  - Agent service integration
  - Tool service interactions
  - End-to-end multi-agent scenarios

### 2. `session-single-context.test.ts`

- **Purpose**: Focused tests specifically verifying the "one session only" requirement
- **Coverage**: SpaceConductor and SpaceContext core functionality
- **Key Tests**:
  - Single session creation and reuse
  - Multi-agent shared context
  - Session lifecycle management
  - Performance and memory tests

## Running the Tests

### Run All Context-Related Tests

```bash
npm run test:context
```

### Run Only the Single Context Tests

```bash
npm run test:context:single
```

### Run Individual Test Files

```bash
# Full integration tests
npx jest session-context.test.ts

# Single context tests
npx jest session-single-context.test.ts

# Watch mode for development
npx jest session-single-context.test.ts --watch
```

## What the Tests Verify

### ✅ Single Session Requirement

- Only one session context is created per sessionId
- Multiple calls to `getOrCreateContext()` return the same instance
- No recursive child sessions are created for agent interactions

### ✅ Multi-Agent Coordination

- Multiple agents can share the same session context
- Events from different agents are properly tracked
- Agent interactions use the shared event bus

### ✅ Event Bus Functionality

- Messages, tool calls, and agent interactions are properly emitted
- Events are received and processed correctly
- Context state is updated based on events

### ✅ Memory Management

- Session contexts can be cleared properly
- No memory leaks when sessions are cleaned up
- Efficient handling of multiple concurrent sessions

### ✅ Data Persistence

- Shared context can be saved to database
- Context can be loaded from database
- Export/import functionality works correctly

## Key Test Scenarios

### Scenario 1: Single Agent Execution

```typescript
// Agent runs in shared context
const context = spaceConductor.getOrCreateContext(sessionId);
// Only one context exists for the session
expect(spaceConductor.getActiveSessionCount()).toBe(1);
```

### Scenario 2: Multi-Agent Interaction

```typescript
// Agent 1 calls Agent 2 via interactWithAgent
commonToolService.interactWithAgent({
  agentId: 'agent-2',
  initiator: 'agent-1',
  sessionId: sessionId, // Same session ID
});
// Still only one session context
expect(spaceConductor.getActiveSessionCount()).toBe(1);
```

### Scenario 3: Event Tracking

```typescript
// Events from different agents in same context
spaceContext.bus.next({ type: 'message', agentId: 'agent-1', ... });
spaceContext.bus.next({ type: 'tool', agentId: 'agent-2', ... });
// All events tracked in shared context
expect(spaceContext.contributions.length).toBe(2);
```

## Expected Test Results

When all tests pass, you can be confident that:

1. **No Recursive Sessions**: Agent interactions don't create child sessions
2. **Shared Context**: All agents in a session share the same context
3. **Event Coordination**: Agents can see and respond to each other's actions
4. **Resource Efficiency**: Only one session context per unique session
5. **Data Integrity**: Context state is maintained correctly across operations

## Debugging Test Failures

### Common Issues

1. **Multiple Sessions Created**

   - Check that `interactWithAgent` doesn't call `runAgent` recursively
   - Verify `SpaceConductor.getOrCreateContext()` returns existing contexts

2. **Events Not Received**

   - Ensure events are emitted to `spaceContext.bus`
   - Check event subscription setup

3. **Context Not Shared**
   - Verify same sessionId is used across agent calls
   - Check that context references are identical

### Debug Logs

The tests include console.log statements that help track:

- Session creation/retrieval
- Event emission and reception
- Context state changes
- Performance metrics

## Performance Expectations

The tests verify that the system can handle:

- ✅ 100+ concurrent sessions efficiently
- ✅ Multiple agents per session without performance degradation
- ✅ Proper memory cleanup when sessions are cleared
- ✅ Fast context retrieval for existing sessions

## Integration with CI/CD

These tests should be run as part of your continuous integration pipeline to ensure:

- Regressions in shared context behavior are caught early
- Performance doesn't degrade over time
- Memory leaks are detected
- The one-session requirement is maintained
