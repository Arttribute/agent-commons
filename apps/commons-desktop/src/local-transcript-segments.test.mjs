import assert from 'node:assert/strict';
import test from 'node:test';
import { speechSegments } from './local-transcript-segments.ts';

test('artifact transcript preserves model timestamps across chunks without inventing positions', () => {
  assert.deepEqual(speechSegments([
    { text: ' Exact words ', timestamp: [1.234, 2.5] },
    { text: 'Last words', timestamp: [3.1, null] },
    { text: 'No timestamp' },
    { text: 'Bad start', timestamp: [-1, 2] },
    { text: 'Reversed', timestamp: [4, 3] },
    { text: 'Outside recording', timestamp: [9, 10] },
    { text: '', timestamp: [0, 1] },
    { text: 'Nonfinite', timestamp: [NaN, 2] },
  ], 4000, 120000), [
    { text: 'Exact words', startMs: 121234, endMs: 122500 },
    { text: 'Last words', startMs: 123100, endMs: 124000 },
  ]);
});
