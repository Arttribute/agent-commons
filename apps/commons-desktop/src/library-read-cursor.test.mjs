import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryReadCursor } from './library-read-cursor.ts';

test('omitted offsets advance through an aliased long file and stop at its end', () => {
  const cursor = new LibraryReadCursor();
  const args = { itemId: 'guide.md' };
  cursor.record('read_library_item', args, JSON.stringify({ itemId: 'file-id', name: 'guide.md', content: 'first chunk', offset: 0, nextOffset: 4000, totalChars: 6500 }));
  assert.deepEqual(cursor.arguments('read_library_item', { itemId: 'file-id' }), { itemId: 'file-id', offset: 4000 });
  cursor.record('read_library_item', { itemId: 'file-id' }, JSON.stringify({ itemId: 'file-id', name: 'guide.md', content: 'last chunk', offset: 4000, nextOffset: null, totalChars: 6500 }));
  assert.equal(cursor.arguments('read_library_item', args).offset, 6500);
  assert.deepEqual(cursor.arguments('read_library_item', { ...args, offset: 0 }), { ...args, offset: 0 });
  assert.deepEqual(cursor.arguments('read_library_item', { itemId: 'another.md' }), { itemId: 'another.md' });
  assert.deepEqual(new LibraryReadCursor().arguments('read_library_item', args), args);
});

test('errors and unrelated tools cannot change file read positions', () => {
  const cursor = new LibraryReadCursor();
  cursor.record('read_library_item', { itemId: 'guide.md' }, 'Error: unavailable');
  cursor.record('run_python', { itemId: 'guide.md' }, JSON.stringify({ content: 'ignored', offset: 0, nextOffset: 100 }));
  assert.deepEqual(cursor.arguments('read_library_item', { itemId: 'guide.md' }), { itemId: 'guide.md' });
});
