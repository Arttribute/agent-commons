import { MAX_CONSECUTIVE_TOOL_SCHEMA_FAILURES, nextToolSchemaFailureCount } from './tool-schema-retry';

describe('tool schema retry limit', () => {
  it('stops a repeated invalid tool call after three failed attempts', () => {
    const failure = { status: 'error', content: 'Error: Received tool input did not match expected schema\n Please fix your mistakes.' };
    let count = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) count = nextToolSchemaFailureCount(count, failure);
    expect(count).toBe(MAX_CONSECUTIVE_TOOL_SCHEMA_FAILURES);
    expect(nextToolSchemaFailureCount(count, { status: 'success', content: 'Done' })).toBe(0);
  });
});
