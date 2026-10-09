import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSourceEvidence } from './local-source-evidence.ts';

const read = (itemId, content, extra = {}) => JSON.stringify({ itemId, name: `${itemId}.json`, content, offset: 0, nextOffset: null, totalChars: content.length, pythonInput: `INPUT_FILES["${itemId}"]`, ...extra });

test('exhausted reads and later tool results preserve complete small source facts', () => {
  const evidence = new LocalSourceEvidence();
  evidence.record('read_library_item', read('input', '{"price":12000,"date":"TBC"}'));
  const original = evidence.render();
  evidence.record('read_library_item', read('input', '', { offset: 26, totalChars: 26 }));
  evidence.record('run_python', read('input', 'invented output'));
  evidence.record('read_library_item', 'Error: unavailable');
  assert.equal(evidence.render(), original);
  assert.match(original, /12000/);
  assert.match(original, /INPUT_FILES/);
  assert.equal(new LocalSourceEvidence().render(), '');
});

test('partial or large documents do not crowd out complete source inputs', () => {
  const evidence = new LocalSourceEvidence();
  evidence.record('read_library_item', read('input', 'approved facts'));
  evidence.record('read_library_item', read('guide', 'a'.repeat(1200), { nextOffset: 1200, totalChars: 8000 }));
  evidence.record('read_library_item', read('large', 'a'.repeat(1800)));
  assert.match(evidence.render(), /approved facts/);
  assert.doesNotMatch(evidence.render(), /guide|large/);
});

test('evidence budgets retain whole valid JSON entries and count UTF-8 bytes', () => {
  const evidence = new LocalSourceEvidence();
  evidence.record('read_library_item', read('a', '☕'.repeat(50)));
  evidence.record('read_library_item', read('b', '最新'.repeat(50)));
  const result = evidence.render(500);
  assert.ok(Buffer.byteLength(result) <= 500);
  for (const line of result.split('\n').filter(Boolean)) assert.ok(JSON.parse(line).itemId);
});
