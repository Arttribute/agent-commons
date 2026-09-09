import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcript, changeCounts, textContent } from '../src/chat';
test('restores platform and serialized LangChain messages without tool internals', () => {
  assert.deepEqual(
    transcript({
      history: [
        { role: 'human', content: 'Fix it' },
        { role: 'tool', content: 'secret tool trace' },
        { type: 'ai', content: [{ type: 'text', text: 'Done' }] },
        { id: ['langchain', 'HumanMessage'], kwargs: { content: 'Next task' } },
      ],
    }).map((m) => [m.role, m.content]),
    [
      ['user', 'Fix it'],
      ['assistant', 'Done'],
      ['user', 'Next task'],
    ]
  );
  assert.equal(
    textContent({
      content: [
        { type: 'image_url', image_url: 'x' },
        { type: 'text', text: 'Summary' },
      ],
    }),
    'Summary'
  );
});
test('change summaries exclude unchanged prefix and suffix', () => {
  assert.deepEqual(changeCounts('a\nb\nc', 'a\nx\ny\nc'), { added: 2, removed: 1 });
  assert.deepEqual(changeCounts('a', 'a'), { added: 0, removed: 0 });
  assert.deepEqual(changeCounts('', 'new'), { added: 1, removed: 0 });
});
