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

test('verified coverage survives aliases, overlapping reads and missing earlier context', () => {
  const cursor = new LibraryReadCursor();
  const record = (offset, content, nextOffset) => cursor.record('read_library_item', { itemId: 'guide.md' }, JSON.stringify({ itemId: 'file-id', name: 'guide.md', offset, content, nextOffset, totalChars: 10 }));
  record(0, 'abcd', 4);
  record(7, 'hij', null);
  assert.deepEqual(JSON.parse(cursor.render()).readRanges, [[0, 4], [7, 10]]);
  assert.equal(JSON.parse(cursor.render()).fullyRead, false);
  record(3, 'defgh', 8);
  assert.deepEqual(JSON.parse(cursor.render()), { itemId: 'file-id', name: 'guide.md', totalChars: 10, readRanges: [[0, 10]], fullyRead: true });
  assert.equal(cursor.arguments('read_library_item', { itemId: 'file-id' }).offset, 8);
});

test('truncated or invalid tool content cannot claim complete coverage', () => {
  const cursor = new LibraryReadCursor();
  cursor.record('read_library_item', { itemId: 'guide.md' }, JSON.stringify({ itemId: 'file-id', name: 'guide.md', content: 'short excerpt', offset: 0, nextOffset: null, totalChars: 100 }));
  assert.equal(cursor.render(), '');
  cursor.record('read_library_item', { itemId: 'guide.md' }, 'Error: unavailable');
  assert.equal(cursor.render(), '');
});

test('changed length clears old coverage and UTF-8 metadata stays bounded', () => {
  const cursor = new LibraryReadCursor();
  const record = (id, content, totalChars, offset = 0) => cursor.record('read_library_item', { itemId: id }, JSON.stringify({ itemId: id, name: 'é'.repeat(150) + '.md', content, offset, nextOffset: offset + content.length < totalChars ? offset + content.length : null, totalChars }));
  record('changed', 'abc', 3);
  record('changed', 'd', 5, 3);
  assert.deepEqual(JSON.parse(cursor.render()).readRanges, [[3, 4]]);
  assert.equal(JSON.parse(cursor.render()).fullyRead, false);
  for (let index = 0; index < 30; index++) record(`file-${index}`, 'abc', 3);
  const output = cursor.render();
  assert.ok(Buffer.byteLength(output) <= 1200);
  assert.ok(output.includes('file-29'));
  assert.ok(!output.includes('file-0"'));
});
